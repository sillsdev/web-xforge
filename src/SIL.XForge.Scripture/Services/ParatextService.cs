using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.XPath;
using IdentityModel;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using Paratext.Data.ProjectComments;
using PtxUtils;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using SIL.Scripture;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Provides interaction with Paratext libraries for data processing and exchanging data with Paratext servers.
    /// Also contains methods for interacting with the Paratext Registry web service API.
    /// </summary>
    public class ParatextService : DisposableBase, IParatextService
    {
        private readonly IOptions<ParatextOptions> _paratextOptions;
        private readonly IRepository<UserSecret> _userSecretRepository;
        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IFileSystemService _fileSystemService;
        private readonly HttpClientHandler _httpClientHandler;
        private readonly HttpClient _registryClient;
        private readonly IExceptionHandler _exceptionHandler;
        private readonly ILogger _logger;
        private string _applicationProductVersion = "SF";
        private string _registryServerUri = "https://registry.paratext.org";
        private string _sendReceiveServerUri = InternetAccess.uriProduction;


        public ParatextService(IWebHostEnvironment env, IOptions<ParatextOptions> paratextOptions,
            IRepository<UserSecret> userSecretRepository, IRealtimeService realtimeService,
            IExceptionHandler exceptionHandler, IOptions<SiteOptions> siteOptions, IFileSystemService fileSystemService,
            ILogger<ParatextService> logger)
        {
            _paratextOptions = paratextOptions;
            _userSecretRepository = userSecretRepository;
            _realtimeService = realtimeService;
            _exceptionHandler = exceptionHandler;
            _siteOptions = siteOptions;
            _fileSystemService = fileSystemService;
            _logger = logger;

            // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
            _httpClientHandler = new HttpClientHandler();
            _registryClient = new HttpClient(_httpClientHandler);
            if (env.IsDevelopment() || env.IsEnvironment("Testing"))
            {
                _httpClientHandler.ServerCertificateCustomValidationCallback
                    = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
                _registryServerUri = "https://registry-dev.paratext.org";
                _registryClient.BaseAddress = new Uri(_registryServerUri);
                _sendReceiveServerUri = InternetAccess.uriDevelopment;
            }
            else
            {
                _registryClient.BaseAddress = new Uri(_registryServerUri);
            }
            _registryClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            ScrTextCollection = new LazyScrTextCollection();
            JwtTokenHelper = new JwtTokenHelper();
            HgWrapper = new HgWrapper();

            SharingLogicWrapper = new SharingLogicWrapper();
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        }

        public static string AssemblyDirectory
        {
            get
            {
                string codeBase = Assembly.GetExecutingAssembly().CodeBase;
                UriBuilder uri = new UriBuilder(codeBase);
                string path = Uri.UnescapeDataString(uri.Path);
                return Path.GetDirectoryName(path);
            }
        }

        ///< summary> Path to cloned PT project Mercurial repos. </summary>
        public string SyncDir { get; set; }

        internal IScrTextCollection ScrTextCollection { get; set; }
        internal ISharingLogicWrapper SharingLogicWrapper { get; set; }
        internal IHgWrapper HgWrapper { get; set; }
        internal IJwtTokenHelper JwtTokenHelper { get; set; }
        /// <summary> Set of SF user IDs and corresponding sources for remote PT projects. </summary>
        internal Dictionary<string, IInternetSharedRepositorySource> InternetSharedRepositorySources { get; set; }
            = new Dictionary<string, IInternetSharedRepositorySource>();

        /// <summary> Prepare access to Paratext.Data library, authenticate, and prepare Mercurial. </summary>
        public void Init()
        {
            SyncDir = Path.Combine(_siteOptions.Value.SiteDir, "sync");
            if (!_fileSystemService.DirectoryExists(SyncDir))
                _fileSystemService.CreateDirectory(SyncDir);
            RegistryU.Implementation = new DotNetCoreRegistry();
            Alert.Implementation = new DotNetCoreAlert(_logger);
            ParatextDataSettings.Initialize(new PersistedParatextDataSettings());
            PtxUtilsDataSettings.Initialize(new PersistedPtxUtilsSettings());
            SetupMercurial();
            WritingSystemRepository.Initialize();
            ScrTextCollection.Initialize(SyncDir);
            RegistryServer.Initialize(_applicationProductVersion);
        }

        /// <summary> Copy resource files from the Assembly Directory into the sync directory. </summary>
        public void InstallStyles(UserSecret userSecret)
        {
            string usfmStyFile = Path.Combine(SyncDir, "usfm.sty");
            if (!File.Exists(usfmStyFile))
            {
                string[] resources = new[] { "usfm.sty", "revisionStyle.sty", "revisionTemplate.tem" };
                foreach (string resource in resources)
                {
                    string target = Path.Combine(SyncDir, resource);
                    string source = Path.Combine(AssemblyDirectory, resource);
                    File.Copy(source, target, true);
                }
            }
        }

        /// <summary>
        /// Synchronizes the text and notes data on the SF server with the data on the Paratext server.
        /// </summary>
        public async Task SendReceiveAsync(UserSecret userSecret, IEnumerable<string> ptProjectIds,
            IProgress<ProgressState> progress = null)
        {
            if (userSecret == null || ptProjectIds == null) { throw new ArgumentNullException(); }

            IInternetSharedRepositorySource source = await GetInternetSharedRepositorySource(userSecret);
            IEnumerable<SharedRepository> repositories = source.GetRepositories();
            Dictionary<string, ParatextProject> ptProjectsAvailable =
                GetProjects(userSecret, repositories).ToDictionary(ptProject => ptProject.ParatextId);
            IEnumerable<string> unconnectedProjects = ptProjectIds.Except(ptProjectsAvailable.Keys);
            if (unconnectedProjects.Any())
            {
                throw new ArgumentException(
                    "PT projects with the following PT ids were requested but without access or they don't exist: " +
                        string.Join(", ", unconnectedProjects.ToList()));
            }

            string username = GetParatextUsername(userSecret);
            foreach (string ptProjectId in ptProjectIds)
            {
                ScrText scrText = ScrTextCollection.FindById(username, ptProjectId);
                if (scrText == null)
                    await CloneProjectRepoAsync(userSecret, ptProjectId);
            }

            StartProgressReporting(progress);
            List<SharedProject> sharedPtProjectsToSr = ptProjectIds.Select(ptProjId =>
                SharingLogicWrapper.CreateSharedProject(ptProjId, ptProjectsAvailable[ptProjId].ShortName,
                    source.AsInternetSharedRepositorySource(), repositories)).ToList();

            foreach (SharedProject sp in sharedPtProjectsToSr)
            {
                if (sp.ScrText == null)
                    sp.ScrText = ScrTextCollection.FindById(username, sp.SendReceiveId);
            }

            // TODO report results
            List<SendReceiveResult> results = Enumerable.Empty<SendReceiveResult>().ToList();
            bool success = false; // todo test fail 'success'
            // todo test fail 'noErrors'
            bool noErrors = SharingLogicWrapper.HandleErrors(() => success = SharingLogicWrapper
                .ShareChanges(sharedPtProjectsToSr, source.AsInternetSharedRepositorySource(),
                out results, sharedPtProjectsToSr));
            // todo test exception occurrence
            if (!noErrors || !success)
                throw new InvalidOperationException(
                    "Failed: Errors occurred while performing the sync with the Paratext Server.");
        }

        /// <summary> Get Paratext projects that a user has access to. </summary>
        public async Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret)
        {
            IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(userSecret);
            IEnumerable<SharedRepository> remotePtProjects = ptRepoSource.GetRepositories();
            return GetProjects(userSecret, remotePtProjects);
        }

        public async Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId)
        {
            if (userSecret.ParatextTokens == null)
                return Attempt.Failure((string)null);
            try
            {
                var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
                Claim subClaim = accessToken.Claims.FirstOrDefault(c => c.Type == JwtClaimTypes.Subject);
                // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
                string response = await CallApiAsync(_registryClient, userSecret, HttpMethod.Get,
                    $"projects/{paratextId}/members/{subClaim.Value}");
                var memberObj = JObject.Parse(response);
                return Attempt.Success((string)memberObj["role"]);
            }
            catch (HttpRequestException)
            {
                return Attempt.Failure((string)null);
            }
        }

        /// <summary> Get the Paratext username from the UserSecret. </summary>
        public string GetParatextUsername(UserSecret userSecret)
        {
            return JwtTokenHelper.GetParatextUsername(userSecret);
        }

        public async Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(UserSecret userSecret,
            string projectId)
        {
            // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
            string response = await CallApiAsync(_registryClient, userSecret, HttpMethod.Get,
                $"projects/{projectId}/members");
            var members = JArray.Parse(response);
            return members.OfType<JObject>()
                .Where(m => !string.IsNullOrEmpty((string)m["userId"]) && !string.IsNullOrEmpty((string)m["role"]))
                .ToDictionary(m => (string)m["userId"], m => (string)m["role"]);
        }

        /// <summary>Get list of book numbers in PT project.</summary>
        public IReadOnlyList<int> GetBookList(UserSecret userSecret, string ptProjectId)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), ptProjectId);
            if (scrText == null)
                return Array.Empty<int>();
            return scrText.Settings.BooksPresentSet.SelectedBookNumbers.ToArray();
        }

        /// <summary>Get PT book text in USX, or throw if can't.</summary>
        public string GetBookText(UserSecret userSecret, string ptProjectId, int bookNum)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), ptProjectId);
            if (scrText == null)
            {
                scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), ptProjectId);
                if (scrText == null)
                    throw new DataNotFoundException("Can't get access to cloned project.");
            }
            string usfm = scrText.GetText(bookNum);
            return UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
        }

        /// <summary> Write up-to-date book text from mongo database to Paratext project folder. </summary>
        public void PutBookText(UserSecret userSecret, string projectId, int bookNum, string usx)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), projectId);
            var doc = new XmlDocument
            {
                PreserveWhitespace = true
            };
            doc.LoadXml(usx);
            UsxFragmenter.FindFragments(scrText.ScrStylesheet(bookNum), doc.CreateNavigator(),
                XPathExpression.Compile("*[false()]"), out string usfm);
            usfm = UsfmToken.NormalizeUsfm(scrText.ScrStylesheet(bookNum), usfm, false, scrText.RightToLeft);
            scrText.PutText(bookNum, 0, false, usfm, null);
            _logger.LogInformation("{0} updated {1} in {2}.", GetParatextUsername(userSecret),
                Canon.BookNumberToEnglishName(bookNum), scrText.Name);
        }

        /// <summary> Get notes from the Paratext project folder. </summary>
        public string GetNotes(UserSecret userSecret, string projectId, int bookNum)
        {
            // TODO: should return some data structure instead of XML
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), projectId);
            if (scrText == null)
                return null;

            CommentManager manager = CommentManager.Get(scrText);
            var threads = manager.FindThreads((commentThread) => { return commentThread.VerseRef.BookNum == bookNum; },
                true);
            return NotesFormatter.FormatNotes(threads);
        }

        /// <summary> Write up-to-date notes from the mongo database to the Paratext project folder </summary>
        public void PutNotes(UserSecret userSecret, string projectId, string notesText)
        {
            // TODO: should accept some data structure instead of XML
            List<string> users = new List<string>();
            int nbrAddedComments = 0, nbrDeletedComments = 0, nbrUpdatedComments = 0;
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), projectId);
            if (scrText == null)
                throw new DataNotFoundException("Can't get access to cloned project.");
            CommentManager manager = CommentManager.Get(scrText);
            var notes = NotesFormatter.ParseNotes(notesText);

            // Algorithm sourced from Paratext DataAccessServer
            foreach (var thread in notes)
            {
                CommentThread existingThread = manager.FindThread(thread[0].Thread);
                foreach (var comment in thread)
                {
                    var existingComment = existingThread?.Comments.FirstOrDefault(c => c.Id == comment.Id);
                    if (existingComment == null)
                    {
                        manager.AddComment(comment);
                        nbrAddedComments++;
                    }
                    else if (comment.Deleted)
                    {
                        existingComment.Deleted = true;
                        nbrDeletedComments++;
                    }
                    else
                    {
                        existingComment.ExternalUser = comment.ExternalUser;
                        existingComment.Contents = comment.Contents;
                        existingComment.VersionNumber += 1;
                        nbrUpdatedComments++;
                    }

                    if (!users.Contains(comment.User))
                        users.Add(comment.User);
                }
            }

            try
            {
                foreach (string user in users)
                    manager.SaveUser(user, false);
                VersionedText vText = VersioningManager.Get(scrText);
                vText.Commit($"{nbrAddedComments} notes added and {nbrDeletedComments + nbrUpdatedComments} notes updated or deleted in synchronize",
                     null, false, GetParatextUsername(userSecret));
                _logger.LogInformation("{0} added {1} notes, updated {2} notes and deleted {3} notes",
                    GetParatextUsername(userSecret), nbrAddedComments, nbrUpdatedComments, nbrDeletedComments);
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Exception while updating notes: {0}", e.Message);
            }
        }

        // TODO Set up a Dispose method to call these if that's important.
        protected override void DisposeManagedResources()
        {
            _registryClient.Dispose();
            _httpClientHandler.Dispose();
        }

        private IReadOnlyList<ParatextProject> GetProjects(UserSecret userSecret,
            IEnumerable<SharedRepository> remotePtProjects)
        {
            if (userSecret == null) throw new ArgumentNullException();

            List<ParatextProject> paratextProjects = new List<ParatextProject>();
            IQueryable<SFProject> existingSfProjects = _realtimeService.QuerySnapshots<SFProject>();

            foreach (SharedRepository remotePtProject in remotePtProjects)
            {
                SFProject correspondingSfProject =
                    existingSfProjects.FirstOrDefault(sfProj => sfProj.ParatextId == remotePtProject.SendReceiveId);

                bool sfProjectExists = correspondingSfProject != null;
                bool sfUserIsOnSfProject = correspondingSfProject?.UserRoles.ContainsKey(userSecret.Id) ?? false;
                bool adminOnPtProject = remotePtProject.SourceUsers.GetRole(
                    GetParatextUsername(userSecret)) == UserRoles.Administrator;
                bool ptProjectIsConnectable =
                    (sfProjectExists && !sfUserIsOnSfProject) || (!sfProjectExists && adminOnPtProject);

                paratextProjects.Add(new ParatextProject
                {
                    ParatextId = remotePtProject.SendReceiveId,
                    // TODO: Query the Paratext Registry to get the full name of the project because the
                    // SharedRepository for a project only lists the short names.
                    Name = correspondingSfProject?.Name ?? remotePtProject.ScrTextName,
                    ShortName = remotePtProject.ScrTextName,
                    LanguageTag = correspondingSfProject?.WritingSystem.Tag,
                    ProjectId = correspondingSfProject?.Id,
                    IsConnectable = ptProjectIsConnectable,
                    IsConnected = sfProjectExists && sfUserIsOnSfProject
                });
            }
            return paratextProjects.OrderBy(project => project.Name, StringComparer.InvariantCulture).ToArray();
        }

        private void SetupMercurial()
        {
            string customHgPath = _paratextOptions.Value.HgExe;
            if (!File.Exists(customHgPath))
            {
                string msg = string.Format(
                    "Error: Could not find hg executable at {0}. Please install hg 4.7 or greater.", customHgPath);
                _logger.LogError(msg);
                throw new InvalidOperationException(msg);
            }
            var hgMerge = Path.Combine(AssemblyDirectory, "ParatextMerge.py");
            HgWrapper.SetDefault(new Hg(customHgPath, hgMerge, AssemblyDirectory));
        }

        /// <summary> Clone the paratext project to the local SF server. </summary>
        private async Task CloneProjectRepoAsync(UserSecret userSecret, string ptProjectId)
        {
            ParatextProject ptProject = (await GetProjectsAsync(userSecret)).FirstOrDefault(proj => proj.ParatextId == ptProjectId);
            SharedRepository ptProjectRepoInfo = new SharedRepository(ptProject.ShortName, ptProject.ParatextId, RepositoryType.Shared);
            string clonePath = Path.Combine(SyncDir, ptProject.ParatextId);
            if (!_fileSystemService.DirectoryExists(clonePath))
            {
                _fileSystemService.CreateDirectory(clonePath);
                HgWrapper.Init(clonePath);
            }
            IInternetSharedRepositorySource ptRepositorySource = await GetInternetSharedRepositorySource(userSecret);
            ptRepositorySource.Pull(clonePath, ptProjectRepoInfo);
            HgWrapper.Update(clonePath);
        }

        private async Task RefreshAccessTokenAsync(UserSecret userSecret)
        {
            ParatextOptions options = _paratextOptions.Value;

            userSecret.ParatextTokens = await JwtTokenHelper.RefreshAccessTokenAsync(options,
                userSecret.ParatextTokens, _registryClient);

            await _userSecretRepository.UpdateAsync(userSecret, b =>
                b.Set(u => u.ParatextTokens, userSecret.ParatextTokens));
        }

        private async Task<string> CallApiAsync(HttpClient client, UserSecret userSecret, HttpMethod method,
            string url, string content = null)
        {
            if (userSecret == null)
                throw new SecurityException("The current user is not signed into Paratext.");

            bool expired = !userSecret.ParatextTokens.ValidateLifetime();
            bool refreshed = false;
            while (!refreshed)
            {
                if (expired)
                {
                    await RefreshAccessTokenAsync(userSecret);
                    refreshed = true;
                }

                var request = new HttpRequestMessage(method, $"api8/{url}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer",
                    userSecret.ParatextTokens.AccessToken);
                if (content != null)
                    request.Content = new StringContent(content);
                HttpResponseMessage response = await client.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    return await response.Content.ReadAsStringAsync();
                }
                else if (response.StatusCode == HttpStatusCode.Unauthorized)
                {
                    expired = true;
                }
                else
                {
                    string error = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException(
                        $"HTTP Request error, Code: {response.StatusCode}, Content: {error}");
                }
            }

            throw new SecurityException("The current user's Paratext access token is invalid.");
        }

        /// <summary>
        /// Get cached or setup new access to a source for PT project repositories, based on user secret.
        ///</summary>
        private async Task<IInternetSharedRepositorySource> GetInternetSharedRepositorySource(UserSecret userSecret)
        {
            if (userSecret == null) throw new ArgumentNullException();
            IInternetSharedRepositorySource source;
            await RefreshAccessTokenAsync(userSecret);

            if (!InternetSharedRepositorySources.ContainsKey(userSecret.Id))
            {
                JwtRESTClient jwtClient = GenerateParatextRegistryJwtClient(userSecret);
                source = new JwtInternetSharedRepositorySource(userSecret.ParatextTokens.AccessToken, jwtClient,
                    _sendReceiveServerUri);
                InternetSharedRepositorySources[userSecret.Id] = source;
            }
            source = InternetSharedRepositorySources[userSecret.Id];
            source.RefreshToken(userSecret.ParatextTokens.AccessToken);
            return source;
        }

        /// <summary>
        /// Initialize the Registry Server with a Jwt REST Client. Must be called for each unique user.
        /// </summary>
        private JwtRESTClient GenerateParatextRegistryJwtClient(UserSecret userSecret)
        {
            string jwtToken = JwtTokenHelper.GetJwtTokenFromUserSecret(userSecret);

            string api = _registryServerUri + "/api8/";
            return new JwtRESTClient(api, _applicationProductVersion, jwtToken);
        }

        // Make sure there are no asynchronous methods called after this until the progress is completed.
        private void StartProgressReporting(IProgress<ProgressState> progress)
        {
            if (progress == null)
                return;
            var progressDisplay = new SyncProgressDisplay(progress);
            PtxUtils.Progress.Progress.Mgr.SetDisplay(progressDisplay);
        }
    }
}
