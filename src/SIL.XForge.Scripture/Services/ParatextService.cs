using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.XPath;
using IdentityModel;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
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
using SIL.Scripture;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Provides interaction with Paratext libraries for data processing and exchanging data with Paratext servers.
    /// Also contains methods for interacting with the Paratext Registry web service API.
    ///
    /// TODO: Implement progress reporting. PT uses singleton classes to handle progress. Implement ProgressDisplay
    /// interface and call Progress.Mgr.SetDisplay() to get progress reports. Make sure that you call SetDisplay() right
    /// before you call any ParatextData code. The Progress.Mgr instance has a ThreadStatic attribute in order to make
    /// it thread-safe. If anything is awaited, then a different thread might take over for the call stack. If this
    /// occurs, a different ProgressDisplay instance will receive the progress reports.
    /// </summary>
    public class ParatextService : DisposableBase, IParatextService
    {
        ///< summary>Path to cloned PT project Mercurial repos.</summary>
        public string SyncDir;
        internal IScrTextCollectionWrapper _scrTextCollectionWrapper;
        internal ISharingLogicWrapper _sharingLogicWrapper;
        internal IHgHelper _hgHelper;
        /// <summary>Set of SF user IDs and corresponding sources for remote PT projects.</summary>
        internal Dictionary<string, IInternetSharedRepositorySource> _internetSharedRepositorySource = new Dictionary<string, IInternetSharedRepositorySource>();
        private readonly IOptions<ParatextOptions> _paratextOptions;
        private readonly IRepository<UserSecret> _userSecretRepository;
        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IFileSystemService _fileSystemService;
        private readonly HttpClientHandler _httpClientHandler;
        private readonly HttpClient _registryClient;
        private readonly IExceptionHandler _exceptionHandler;
        private readonly bool _useDevServer;
        private readonly string _resourcesPath;
        private string applicationProductVersion = "SF";
        private string _serverUri = "https://registry-dev.paratext.org/api8/";


        public ParatextService(IWebHostEnvironment env, IOptions<ParatextOptions> paratextOptions,
            IRepository<UserSecret> userSecretRepository, IRealtimeService realtimeService, IExceptionHandler exceptionHandler,
            IOptions<SiteOptions> siteOptions, IFileSystemService fileSystemService)
        {
            _paratextOptions = paratextOptions;
            _userSecretRepository = userSecretRepository;
            _realtimeService = realtimeService;
            _exceptionHandler = exceptionHandler;
            _siteOptions = siteOptions;
            _fileSystemService = fileSystemService;
            // _resourcesPath = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "....");
            _resourcesPath = "/home/vagrant/src/web-xforge";

            // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
            _httpClientHandler = new HttpClientHandler();
            _registryClient = new HttpClient(_httpClientHandler);
            if (env.IsDevelopment() || env.IsEnvironment("Testing"))
            {
                _httpClientHandler.ServerCertificateCustomValidationCallback
                    = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
                _registryClient.BaseAddress = new Uri("https://registry-dev.paratext.org");
                _useDevServer = true;
            }
            else
            {
                _registryClient.BaseAddress = new Uri("https://registry.paratext.org");
                _useDevServer = false;
            }
            _registryClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            _scrTextCollectionWrapper = new ScrTextCollectionWrapper();
            _hgHelper = new HgHelper();

            _sharingLogicWrapper = new SharingLogicWrapper();
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
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
            InstallStyles();
            WritingSystemRepository.Initialize();
            // TODO will this crash if haven't set user credentials yet?
            _scrTextCollectionWrapper.Initialize(SyncDir, false);
        }

        public async Task SetupAccessToPtRegistry(UserSecret userSecret)
        {
            await RefreshAccessTokenAsync(userSecret);
            var jwtToken = userSecret.ParatextTokens.AccessToken;
            if (jwtToken?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ?? false)
            {
                jwtToken = jwtToken.Substring("Bearer ".Length).Trim();
            }

            // TODO Do we need to do additional validation? cli used Jose.JWT.Decode...
            // May be able to use InternetAccess.RegistryServer - See SF-PT Engineering meeting notes
            var jwtRESTClient = new JwtRESTClient(_serverUri, ApplicationProduct.DefaultVersion, jwtToken);
            // This is not complete, the RegistrationInfo class still gets registration info from RegistrationInfo.xml
            // from the local paratext installation. It should retrieve authentication from the JwtRestClient instead
            RegistryServer.Initialize(applicationProductVersion, jwtRESTClient);
        }

        // TODO might need to do?: lock repo, pull, merge, push results, unlock repo.
        /// <summary>(Learning/experimenting by writing Sendreceive anew)</summary>
        public async Task SendReceiveAsync(UserSecret userSecret, IEnumerable<string> ptProjectIds)
        {
            if (userSecret == null || ptProjectIds == null) { throw new ArgumentNullException(); }

            IInternetSharedRepositorySource source = GetInternetSharedRepositorySource(userSecret);
            IEnumerable<SharedRepository> repositories = source.GetRepositories();
            Dictionary<string, ParatextProject> ptProjectsAvailable =
                (await GetProjectsAsync(userSecret)).ToDictionary(ptProject => ptProject.ParatextId);
            IEnumerable<string> unconnectedProjects = ptProjectIds.Except(ptProjectsAvailable.Keys);
            if (unconnectedProjects.Any())
            {
                throw new ArgumentException(
                    $"PT projects with the following PT ids were requested but without access or they don't exist: {string.Join(", ", unconnectedProjects.ToList())}");
            }
            List<SharedProject> sharedPtProjectsToSr = ptProjectIds.Select(ptProjId =>
                _sharingLogicWrapper.CreateSharedProject(ptProjId, ptProjectsAvailable[ptProjId].ShortName,
                    source.AsInternetSharedRepositorySource(), repositories)).ToList();

            // TODO report results
            List<SendReceiveResult> results = Enumerable.Empty<SendReceiveResult>().ToList();
            bool success = false; // todo test fail 'success'
            // todo test fail 'noErrors'
            bool noErrors = _sharingLogicWrapper.HandleErrors(() => success = _sharingLogicWrapper.ShareChanges(sharedPtProjectsToSr, source.AsInternetSharedRepositorySource(),
                out results, sharedPtProjectsToSr));
            // todo test exception occurrence
            if (!noErrors || !success) { throw new Exception("!"); }
        }

        /// <summary>Get Paratext projects that a user has access to.
        /// TODO what about projects the user does not have access to.
        /// TODO Revise IsConnectable and IsConnected according to updated comments in ParatextProject.cs.</summary>
        public async Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret)
        {
            if (userSecret == null) throw new ArgumentNullException();

            List<ParatextProject> paratextProjects = new List<ParatextProject>();
            IInternetSharedRepositorySource ptRepoSource = GetInternetSharedRepositorySource(userSecret);
            IEnumerable<SharedRepository> remotePtProjects = ptRepoSource.GetRepositories();
            IQueryable<SFProject> existingSfProjects = _realtimeService.QuerySnapshots<SFProject>();

            foreach (SharedRepository remotePtProject in remotePtProjects)
            {
                SFProject correspondingSfProject =
                    existingSfProjects.FirstOrDefault(sfProj => sfProj.ParatextId == remotePtProject.SendReceiveId);

                bool sfProjectExists = correspondingSfProject != null;
                bool sfUserIsOnSfProject = correspondingSfProject?.UserRoles.ContainsKey(userSecret.Id) ?? false;
                // TODO Fetch and use actual PT username.
                bool adminOnPtProject = remotePtProject.SourceUsers.GetRole("the_username") == UserRoles.Administrator;
                bool ptProjectIsConnectable =
                    (sfProjectExists && !sfUserIsOnSfProject) || (!sfProjectExists && adminOnPtProject);

                paratextProjects.Add(new ParatextProject
                {
                    ParatextId = remotePtProject.SendReceiveId,
                    // TODO Get project long name when don't have a corresponding SF project yet. ScrTextName is the short name.
                    Name = correspondingSfProject?.Name,
                    ShortName = remotePtProject.ScrTextName,
                    LanguageTag = correspondingSfProject?.WritingSystem.Tag,
                    SFProjectId = correspondingSfProject?.Id,
                    IsConnectable = ptProjectIsConnectable,
                    IsConnected = sfProjectExists && sfUserIsOnSfProject
                });
            }
            return paratextProjects;

            // .OrderBy(project => project.Name, StringComparer.InvariantCulture).ToArray();
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
            if (userSecret.ParatextTokens == null)
                return null;
            var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
            Claim usernameClaim = accessToken.Claims.FirstOrDefault(c => c.Type == "username");
            return usernameClaim?.Value;
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
        public IReadOnlyList<int> GetBookList(string ptProjectId)
        {
            ScrText scrText = _scrTextCollectionWrapper.FindById(ptProjectId);
            if (scrText == null)
                return Array.Empty<int>();
            return scrText.Settings.BooksPresentSet.SelectedBookNumbers.ToArray();
        }

        /// <summary>Get PT book text in USX, or throw if can't.</summary>
        public async Task<string> GetBookTextAsync(UserSecret userSecret, string ptProjectId, int bookNum)
        {
            ScrText scrText = _scrTextCollectionWrapper.FindById(ptProjectId);
            if (scrText == null)
            {
                await CloneProjectRepoAsync(userSecret, ptProjectId);
                scrText = _scrTextCollectionWrapper.FindById(ptProjectId);
                if (scrText == null)
                {
                    throw new DataNotFoundException("Can't get access to cloned project.");
                }
            }
            string usfm = scrText.GetText(bookNum);
            return UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
        }

        public string PutBookText(string projectId, int bookNum, string revision, string usx)
        {
            // TODO: this is a guess at how to implement this method
            ScrText scrText = _scrTextCollectionWrapper.FindById(projectId);
            var doc = new XmlDocument
            {
                PreserveWhitespace = true
            };
            doc.LoadXml(usx);
            UsxFragmenter.FindFragments(scrText.ScrStylesheet(bookNum), doc.CreateNavigator(),
                XPathExpression.Compile("*[false()]"), out string usfm);
            usfm = UsfmToken.NormalizeUsfm(scrText.ScrStylesheet(bookNum), usfm, false, scrText.RightToLeft);
            // Since projects can has more than one admin, we may need to do an update on the repo first
            // if (_hgHelper.GetRevisionAtTip(scrText) != revision)
            //     _hgHelper.Update(scrText.Directory, revision);
            scrText.PutText(bookNum, 0, false, usfm, null);
            // This may be needed to commit our work
            /*
            VersionedText vText = VersioningManager.Get(scrText);
            vText.Commit($"Update to book {bookId} by Data Access Server", null, false, user.UserName.ToSafeText());
            if (_hgHelper.GetRevisionAtTip(scrText) != revision)
                vText.PerformMerges(user.UserName.ToSafeText());
            Trace.TraceInformation("Book {0} updated by {1}", bookId, user.UserName);
            */
            return BookTextAsXml(projectId, bookNum);
        }

        public string GetNotes(string projectId, int bookNum)
        {
            // TODO: get notes using CommentManager, see DataAccessServer.HandleNotesRequest for an example
            // should return some data structure instead of XML
            ScrText scrText = _scrTextCollectionWrapper.FindById(projectId);
            if (scrText == null)
                return null;

            CommentManager manager = CommentManager.Get(scrText);
            var threads = manager.FindThreads((commentThread) => { return commentThread.VerseRef.BookNum == bookNum; }, true);
            return NotesFormatter.FormatNotes(threads);
        }

        public void PutNotes(string projectId, string notesText)
        {
            // TODO: save notes using CommentManager, see DataAccessServer.HandleNotesUpdateRequest for an example
            // should accept some data structure instead of XML
            List<string> users = new List<string>();
            int nbrAddedComments = 0, nbrDeletedComments = 0, nbrUpdatedComments = 0;
            ScrText scrText = _scrTextCollectionWrapper.FindById(projectId);
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
            // May need to implement a lock for the project
            // if (!LockProject(scrText))
            //     return CreateErrorResponse(HttpStatusCode.Forbidden, "Could not lock project");
            try
            {
                foreach (string user in users)
                    manager.SaveUser(user, false);
                VersionedText vText = VersioningManager.Get(scrText);
                vText.Commit($"{nbrAddedComments} notes added and {nbrDeletedComments + nbrUpdatedComments} notes updated or deleted in synchronize", null, false, users[0]);
                // TODO probably not "User01" above and below (?).
                Trace.TraceInformation("{0} added {1} notes, updated {2} notes and deleted {3} notes", "User01", nbrAddedComments, nbrUpdatedComments, nbrDeletedComments);
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

        private void SetupMercurial()
        {
            if (Hg.Default != null)
            {
                return;
            }
            var hgExe = "/usr/bin/hg";
            string customHgPath = "/usr/local/bin/hg";
            if (File.Exists(customHgPath))
            {
                // Mercurial 4.7 is needed. Use custom install so can use new enough Mercurial on Ubuntu 16.04.
                hgExe = customHgPath;
            }
            var hgMerge = Path.Combine(_resourcesPath, "ParatextMerge.py");
            Hg.Default = new Hg(hgExe, hgMerge, SyncDir);
        }

        private void InstallStyles()
        {
            string usfmStylesFileName = "usfm.sty";
            string pathToStyle = Path.Combine(_resourcesPath, "/src/SIL.XForge.Scripture", usfmStylesFileName);
            string target = Path.Combine(SyncDir, usfmStylesFileName);
            if (!File.Exists(target))
            {
                File.Copy(pathToStyle, target);
            }
            if (!File.Exists(SyncDir + "/revisionStyle.sty"))
            {
                File.Copy(Path.Combine(_resourcesPath, "revisionStyle.sty"), SyncDir);
            }
            if (!File.Exists(SyncDir + "/revisionTemplate.tem"))
            {
                File.Copy(Path.Combine(_resourcesPath, "revisionTemplate.tem"), SyncDir);
            }
        }

        /// <summary>Clone PT project.</summary>
        private async Task CloneProjectRepoAsync(UserSecret userSecret, string ptProjectId)
        {
            ParatextProject ptProject = (await GetProjectsAsync(userSecret)).FirstOrDefault(proj => proj.ParatextId == ptProjectId);
            SharedRepository ptProjectRepoInfo = new SharedRepository(ptProject.ShortName, ptProject.ParatextId, RepositoryType.Shared);
            string clonePath = Path.Combine(SyncDir, ptProject.ParatextId);
            if (!Directory.Exists(clonePath))
            {
                Directory.CreateDirectory(clonePath);
                Hg.Default.Init(clonePath);
            }
            IInternetSharedRepositorySource ptRepositorySource = GetInternetSharedRepositorySource(userSecret);
            ptRepositorySource.Pull(clonePath, ptProjectRepoInfo);
            Hg.Default.Update(clonePath);
            _scrTextCollectionWrapper.RefreshScrTexts();
        }

        private async Task RefreshAccessTokenAsync(UserSecret userSecret)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "api8/token");

            ParatextOptions options = _paratextOptions.Value;
            var requestObj = new JObject(
                new JProperty("grant_type", "refresh_token"),
                new JProperty("client_id", options.ClientId),
                new JProperty("client_secret", options.ClientSecret),
                new JProperty("refresh_token", userSecret.ParatextTokens.RefreshToken));
            request.Content = new StringContent(requestObj.ToString(), Encoding.UTF8, "application/json");
            HttpResponseMessage response = await _registryClient.SendAsync(request);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            string responseJson = await response.Content.ReadAsStringAsync();
            var responseObj = JObject.Parse(responseJson);
            userSecret.ParatextTokens = new Tokens
            {
                AccessToken = (string)responseObj["access_token"],
                RefreshToken = (string)responseObj["refresh_token"],
            };
            await _userSecretRepository.UpdateAsync(userSecret, b => b.Set(u => u.ParatextTokens, userSecret.ParatextTokens));
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
        private IInternetSharedRepositorySource GetInternetSharedRepositorySource(UserSecret userSecret)
        {
            if (userSecret == null) throw new ArgumentNullException();

            if (!_internetSharedRepositorySource.ContainsKey(userSecret.Id))
            {
                var source = new JwtInternetSharedRepositorySource();
                source.SetToken(userSecret.ParatextTokens.AccessToken);
                _internetSharedRepositorySource[userSecret.Id] = source;
                SetupAccessToPtRegistry(userSecret);
            }
            return _internetSharedRepositorySource[userSecret.Id];
        }

        private string BookTextAsXml(string projectId, int bookNum)
        {
            ScrText scrText = _scrTextCollectionWrapper.FindById(projectId);
            string usfm = scrText.GetText(bookNum);
            string bookText = UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
            XmlDocument usxDoc = new XmlDocument();
            usxDoc.LoadXml(bookText);

            string bookId = Canon.BookNumberToId(bookNum);
            XmlNodeList nodeList = usxDoc.FirstChild.SelectNodes("*");
            if (nodeList != null && (usxDoc.FirstChild == null || nodeList.Count == 0))
            {
                string errorMsg = "No text found at requested location: " + bookId;
                throw new FormatException(errorMsg);
            }
            StringBuilder bldr = new StringBuilder(bookText.Length + 100);
            bldr.AppendFormat("<BookText project=\"{0}\" book=\"{1}\"", scrText.Name, bookId);
            bldr.AppendFormat(" revision=\"{0}\">\n", GetRevisionAtTip(scrText, bookNum));
            bldr.Append(bookText);
            bldr.Append("\n</BookText");
            return bldr.ToString();
        }

        private string GetRevisionAtTip(ScrText scrText, int bookNum)
        {
            return _hgHelper.GetRevisionAtTip(scrText);
        }
    }
}
