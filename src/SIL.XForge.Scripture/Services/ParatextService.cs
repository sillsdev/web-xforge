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
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using System.Diagnostics;
using Paratext.Data.ProjectComments;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Provides interaction with Paratext libraries for data processing and exchanging data with Paratext servers.
    /// Also contains methods for interacting with the Paratext Registry web service API.
    /// </summary>
    public class ParatextService : DisposableBase, IParatextService
    {
        ///< summary>Path to cloned PT project Mercurial repos.</summary>
        public string SyncDir;
        internal IScrTextCollectionWrapper _scrTextCollectionWrapper;
        internal ISharingLogicWrapper _sharingLogicWrapper;
        internal IJwtTokenHelper _jwtTokenHelper;
        /// <summary> Set of SF user IDs and corresponding sources for remote PT projects. </summary>
        internal Dictionary<string, IInternetSharedRepositorySource> _internetSharedRepositorySource =
            new Dictionary<string, IInternetSharedRepositorySource>();
        private readonly IOptions<ParatextOptions> _paratextOptions;
        private readonly IRepository<UserSecret> _userSecretRepository;
        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IFileSystemService _fileSystemService;
        private readonly HttpClientHandler _httpClientHandler;
        private readonly HttpClient _registryClient;
        private readonly IExceptionHandler _exceptionHandler;
        private string applicationProductVersion = "SF";
        private string _serverUri = "https://registry-dev.paratext.org";


        public ParatextService(IHostingEnvironment env, IOptions<ParatextOptions> paratextOptions,
            IRepository<UserSecret> userSecretRepository, IRealtimeService realtimeService, IExceptionHandler exceptionHandler,
            IOptions<SiteOptions> siteOptions, IFileSystemService fileSystemService)
        {
            _paratextOptions = paratextOptions;
            _userSecretRepository = userSecretRepository;
            _realtimeService = realtimeService;
            _exceptionHandler = exceptionHandler;
            _siteOptions = siteOptions;
            _fileSystemService = fileSystemService;

            // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
            _httpClientHandler = new HttpClientHandler();
            _registryClient = new HttpClient(_httpClientHandler);
            if (env.IsDevelopment() || env.IsEnvironment("Testing"))
            {
                _httpClientHandler.ServerCertificateCustomValidationCallback
                    = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
                _registryClient.BaseAddress = new Uri(_serverUri);
            }
            else
            {
                _serverUri = "https://registry.paratext.org";
                _registryClient.BaseAddress = new Uri(_serverUri);
            }
            _registryClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            _scrTextCollectionWrapper = new ScrTextCollectionWrapper();
            _jwtTokenHelper = new JwtTokenHelper();

            _sharingLogicWrapper = new SharingLogicWrapper();
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

        /// <summary>Prepare access to Paratext.Data library, authenticate, and prepare Mercurial.</summary>
        public void Init()
        {
            // Print Paratext error messages.
            Trace.Listeners.Clear();
            Trace.Listeners.Add(new TextWriterTraceListener(Console.Out));
            string syncDir = Path.Combine(_siteOptions.Value.SiteDir, "sync");
            SyncDir = syncDir;
            if (!_fileSystemService.DirectoryExists(syncDir))
                _fileSystemService.CreateDirectory(syncDir);
            RegistryU.Implementation = new DotNetCoreRegistry();
            Alert.Implementation = new DotNetCoreAlert();
            ParatextDataSettings.Initialize(new PersistedParatextDataSettings());
            PtxUtilsDataSettings.Initialize(new PersistedPtxUtilsSettings());
            SetupMercurial();
            WritingSystemRepository.Initialize();
            _scrTextCollectionWrapper.Initialize(SyncDir, false);
        }

        /// <summary> Initialize the Registry Server with a Jwt REST Client. Must be done for each user. </summary>
        public async Task SetupAccessToPtRegistry(UserSecret userSecret)
        {
            await RefreshAccessTokenAsync(userSecret);
            string jwtToken = _jwtTokenHelper.GetJwtTokenFromUserSecret(userSecret);

            string api = _serverUri + "/api8/";
            var jwtRESTClient = new JwtRESTClient(api, ApplicationProduct.DefaultVersion, jwtToken);
            RegistrationInfo.Implementation = new SFRegistrationInfo(GetParatextUsername(userSecret));
            // This is PROBLEMATIC, registry will be set for the previous user
            RegistryServer.Initialize(applicationProductVersion, jwtRESTClient);
        }

        /// <summary> Copy resource files from the Assembly Directory into each individual user folder. </summary>
        public void InstallStyles(UserSecret userSecret)
        {
            string userDir = Path.Combine(SyncDir, GetParatextUsername(userSecret));
            if (!Directory.Exists(userDir))
                Directory.CreateDirectory(userDir);

            string[] resources = new[] { "usfm.sty", "revisionStyle.sty", "revisionTemplate.tem" };
            foreach (string resource in resources)
            {
                string target = Path.Combine(userDir, resource);
                string source = Path.Combine(AssemblyDirectory, resource);
                if (!File.Exists(target))
                    File.Copy(source, target);
            }
        }

        /// <summary>
        /// Synchronizes the text and notes data on the SF server with the data on the Paratext server.
        /// </summary>
        public async Task SendReceiveAsync(UserSecret userSecret, IEnumerable<string> ptProjectIds,
            SyncProgressDisplay progressDisplay = null)
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
            foreach (string ptProjectId in ptProjectIds)
            {
                string projectDir = Path.Combine(SyncDir, GetParatextUsername(userSecret), ptProjectId);
                ScrText scrText = _scrTextCollectionWrapper.FindById(GetParatextUsername(userSecret), ptProjectId);
                if (scrText == null)
                    await CloneProjectRepoAsync(userSecret, ptProjectId);
            }

            _scrTextCollectionWrapper.RefreshScrTexts(Path.Combine(SyncDir, GetParatextUsername(userSecret)));
            StartProgressReporting(progressDisplay);
            List<SharedProject> sharedPtProjectsToSr = ptProjectIds.Select(ptProjId =>
                _sharingLogicWrapper.CreateSharedProject(ptProjId, ptProjectsAvailable[ptProjId].ShortName,
                    source.AsInternetSharedRepositorySource(), repositories)).ToList();

            // TODO report results
            List<SendReceiveResult> results = Enumerable.Empty<SendReceiveResult>().ToList();
            bool success = false; // todo test fail 'success'
            // todo test fail 'noErrors'
            List<SharedProject> srList = new List<SharedProject>();
            srList.AddRange(sharedPtProjectsToSr);
            bool noErrors = _sharingLogicWrapper.HandleErrors(() => success = _sharingLogicWrapper
                .ShareChanges(srList, source.AsInternetSharedRepositorySource(),
                out results, sharedPtProjectsToSr));
            // todo test exception occurrence
            if (!noErrors || !success) { throw new Exception("!"); }
        }

        // TODO Revise IsConnectable and IsConnected according to updated comments in ParatextProject.cs.
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

        public string GetParatextUsername(UserSecret userSecret)
        {
            return _jwtTokenHelper.GetParatextUsername(userSecret);
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
            ScrText scrText = _scrTextCollectionWrapper.FindById(GetParatextUsername(userSecret), ptProjectId);
            if (scrText == null)
                return Array.Empty<int>();
            return scrText.Settings.BooksPresentSet.SelectedBookNumbers.ToArray();
        }

        /// <summary>Get PT book text in USX, or throw if can't.</summary>
        public async Task<string> GetBookTextAsync(UserSecret userSecret, string ptProjectId, int bookNum)
        {
            ScrText scrText = _scrTextCollectionWrapper.FindById(GetParatextUsername(userSecret), ptProjectId);
            if (scrText == null)
            {
                await CloneProjectRepoAsync(userSecret, ptProjectId);
                scrText = _scrTextCollectionWrapper.FindById(GetParatextUsername(userSecret), ptProjectId);
                if (scrText == null)
                    throw new DataNotFoundException("Can't get access to cloned project.");
            }
            string usfm = scrText.GetText(bookNum);
            return UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
        }

        /// <summary> Write up-to-date book text from mongo database to Paratext project folder. </summary>
        public void PutBookText(UserSecret userSecret, string projectId, int bookNum, string usx)
        {
            ScrText scrText = _scrTextCollectionWrapper.FindById(GetParatextUsername(userSecret), projectId);
            var doc = new XmlDocument
            {
                PreserveWhitespace = true
            };
            doc.LoadXml(usx);
            UsxFragmenter.FindFragments(scrText.ScrStylesheet(bookNum), doc.CreateNavigator(),
                XPathExpression.Compile("*[false()]"), out string usfm);
            usfm = UsfmToken.NormalizeUsfm(scrText.ScrStylesheet(bookNum), usfm, false, scrText.RightToLeft);
            scrText.PutText(bookNum, 0, false, usfm, null);
        }

        /// <summary> Get notes from the Paratext project folder. </summary>
        public string GetNotes(UserSecret userSecret, string projectId, int bookNum)
        {
            // TODO: should return some data structure instead of XML
            ScrText scrText = _scrTextCollectionWrapper.FindById(GetParatextUsername(userSecret), projectId);
            if (scrText == null)
                return null;

            CommentManager manager = CommentManager.Get(scrText);
            var threads = manager.FindThreads((commentThread) => { return commentThread.VerseRef.BookNum == bookNum; }, true);
            return NotesFormatter.FormatNotes(threads);
        }

        /// <summary> Write up-to-date notes from the mongo database to the Paratext project folder </summary>
        public void PutNotes(UserSecret userSecret, string projectId, string notesText)
        {
            // TODO: should accept some data structure instead of XML
            List<string> users = new List<string>();
            int nbrAddedComments = 0, nbrDeletedComments = 0, nbrUpdatedComments = 0;
            ScrText scrText = _scrTextCollectionWrapper.FindById(GetParatextUsername(userSecret), projectId);
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
                Trace.TraceInformation("{0} added {1} notes, updated {2} notes and deleted {3} notes",
                    GetParatextUsername(userSecret), nbrAddedComments, nbrUpdatedComments, nbrDeletedComments);
            }
            catch (Exception e)
            {
                Trace.TraceError("Exception while updating notes: {0}", e);
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
                bool adminOnPtProject = remotePtProject.SourceUsers.GetRole(GetParatextUsername(userSecret)) == UserRoles.Administrator;
                bool ptProjectIsConnectable =
                    (sfProjectExists && !sfUserIsOnSfProject) || (!sfProjectExists && adminOnPtProject);

                paratextProjects.Add(new ParatextProject
                {
                    ParatextId = remotePtProject.SendReceiveId,
                    // A limitation of the Paratext API is that one cannot access the full project name at this point
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
            if (Hg.Default != null)
                return;
            var hgExe = "/usr/bin/hg";
            string customHgPath = "/usr/local/bin/hg";
            if (File.Exists(customHgPath))
            {
                // Mercurial 4.7 is needed. Use custom install so can use new enough Mercurial on Ubuntu 16.04.
                hgExe = customHgPath;
            }
            var hgMerge = Path.Combine(AssemblyDirectory, "ParatextMerge.py");
            Hg.Default = new Hg(hgExe, hgMerge, AssemblyDirectory);

            // This allows SF to intercept some Hg commands involving registration codes
            Hg.DefaultRunnerCreationFunc = (installPathArg, repositoryArg, mergePathArg) =>
                new SFHgRunner(installPathArg, repositoryArg, mergePathArg);

        }

        /// <summary>Clone PT project.</summary>
        private async Task CloneProjectRepoAsync(UserSecret userSecret, string ptProjectId)
        {
            ParatextProject ptProject = (await GetProjectsAsync(userSecret)).FirstOrDefault(proj => proj.ParatextId == ptProjectId);
            SharedRepository ptProjectRepoInfo = new SharedRepository(ptProject.ShortName, ptProject.ParatextId, RepositoryType.Shared);
            string clonePath = Path.Combine(SyncDir, GetParatextUsername(userSecret), ptProject.ParatextId);
            if (!Directory.Exists(clonePath))
            {
                Directory.CreateDirectory(clonePath);
                Hg.Default.Init(clonePath);
            }
            IInternetSharedRepositorySource ptRepositorySource = await GetInternetSharedRepositorySource(userSecret);
            ptRepositorySource.Pull(clonePath, ptProjectRepoInfo);
            Hg.Default.Update(clonePath);
        }

        private async Task RefreshAccessTokenAsync(UserSecret userSecret)
        {
            ParatextOptions options = _paratextOptions.Value;

            userSecret.ParatextTokens = await _jwtTokenHelper.RefreshAccessTokenAsync(options,
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

        /// <summary>Get cached or setup new access to a source for PT project repositories, based on user secret.</summary>
        private async Task<IInternetSharedRepositorySource> GetInternetSharedRepositorySource(UserSecret userSecret)
        {
            if (userSecret == null) throw new ArgumentNullException();
            IInternetSharedRepositorySource source;
            if (!_internetSharedRepositorySource.ContainsKey(userSecret.Id))
            {
                source = new JwtInternetSharedRepositorySource(
                userSecret.ParatextTokens.AccessToken, GetParatextUsername(userSecret));
                _internetSharedRepositorySource[userSecret.Id] = source;
            }
            await SetupAccessToPtRegistry(userSecret);
            source = _internetSharedRepositorySource[userSecret.Id];
            source.RefreshToken(userSecret.ParatextTokens.AccessToken);
            return source;
        }

        private void StartProgressReporting(SyncProgressDisplay progressDisplay)
        {
            if (progressDisplay == null)
                progressDisplay = new SyncProgressDisplay();
            PtxUtils.Progress.Progress.Mgr.SetDisplay(progressDisplay);
        }
    }
}
