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
using Paratext.Data.Encodings;
using Paratext.Data.Languages;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
using SIL.ObjectModel;
using SIL.Reflection;
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
    ///
    /// OLD:
    /// This class contains methods for interacting with the Paratext web service APIs.
    ///
    /// TODO: Implement progress reporting. PT uses singleton classes to handle progress. Implement ProgressDisplay
    /// interface and call Progress.Mgr.SetDisplay() to get progress reports. Make sure that you call SetDisplay() right
    /// before you call any ParatextData code. The Progress.Mgr instance has a ThreadStatic attribute in order to make
    /// it thread-safe. If anything is awaited, then a different thread might take over for the call stack. If this
    /// occurs, a different ProgressDisplay instance will receive the progress reports.
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
        private readonly bool _useDevServer;
        internal IScrTextCollectionRunner _scrTextCollectionRunner;
        private readonly string _resourcesPath;

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

            _scrTextCollectionRunner = new ScrTextCollectionRunner();
        }

        public string SyncDir;
        private string applicationProductVersion = "SF";
        private bool jwtRegistered = false;
        internal Dictionary<string, IInternetSharedRepositorySource> _internetSharedRepositorySource = new Dictionary<string, IInternetSharedRepositorySource>();


        /// <summary>Entry point for testing so can consistently isolate and test the same thing.</summary>
        public async Task DevEntryPoint(UserSecret userSecret)
        {
            Console.WriteLine("Begin DevEntryPoint.");
            await RefreshAccessTokenAsync(userSecret);
            Init();
            SetupAccessToPtRegistry(userSecret);

            var projectList = GetProjectsAsync(userSecret);

            var bookText = GetBookText(userSecret, "94f48e5b710ec9e092d9a7ec2d124c30f33a04bf", 8);
            SendReceive2(userSecret);
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
            // Alert.Implementation = new DotNetCoreAlert();
            ParatextDataSettings.Initialize(new PersistedParatextDataSettings());
            PtxUtilsDataSettings.Initialize(new PersistedPtxUtilsSettings());
            SetupMercurial();
            InstallStyles();


            WritingSystemRepository.Initialize();

            // TODO: not sure if using ScrTextCollection is the best idea for a server, since it loads all existing
            // ScrTexts into memory when it is initialized. Possibly use a different implementation, see
            // ScrTextCollectionServer class in DataAccessServer.
            // TODO will this crash if haven't set user credentials yet?
            _scrTextCollectionRunner.Initialize(SyncDir, false);
        }

        public void SetupAccessToPtRegistry(UserSecret userSecret)
        {
            var jwtToken = userSecret.ParatextTokens.AccessToken;
            if (jwtToken?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ?? false)
            {
                jwtToken = jwtToken.Substring("Bearer ".Length).Trim();
            }

            // TODO Do we need to do additional validation? cli used Jose.JWT.Decode...

            // var jwtRESTClient = new JwtRESTClient(/*InternetAccess.RegistryServer*/ /*"https://registry.paratext.org/api8/"*/_registryClient.BaseAddress.AbsoluteUri, ApplicationProduct.DefaultVersion, jwtToken);
            var jwtRESTClient = new JwtRESTClient(/*InternetAccess.RegistryServer*/ "https://registry-dev.paratext.org/api8/", ApplicationProduct.DefaultVersion, jwtToken);
            RegistryServer.Initialize(applicationProductVersion, jwtRESTClient);

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
                // Mercurial 4.7 is needed. Use custom install on Ubuntu 16.04.
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
            IInternetSharedRepositorySource ptRepositorySource = GetInternetSharedRepositorySource(userSecret);
            string clonePath = Path.Combine(SyncDir, ptProject.ParatextId);
            if (!Directory.Exists(clonePath))
            {
                Directory.CreateDirectory(clonePath);
                Hg.Default.Init(clonePath);
            }
            ptRepositorySource.Pull(clonePath, ptProjectRepoInfo);
            Hg.Default.Update(clonePath);
        }

        /// <summary>(Learning/experimenting by writing Sendreceive anew)</summary>
        public void SendReceive2(UserSecret userSecret)
        {
            ScrText scrText = _scrTextCollectionRunner.FindById("94f48e5b710ec9e092d9a7ec2d124c30f33a04bf");


            // BEGIN HACK
            ReflectionHelper.SetField(scrText.Settings, "cachedEncoder", new HackStringEncoder());
            // END HACK

            // string repoPath = "/var/lib/scriptureforge/sync/repoCloneDir";

            // TODO something more reliable than 'as' here.
            var source = GetInternetSharedRepositorySource(userSecret) as JwtInternetSharedRepositorySource;
            var repositories = source.GetRepositories();


            SharedProject sharedProj = SharingLogic.CreateSharedProject(scrText.Guid, "Ott", source as InternetSharedRepositorySource, repositories);


            List<SendReceiveResult> results = Enumerable.Empty<SendReceiveResult>().ToList();
            var list = new[] { sharedProj }.ToList();
            bool success = false;
            bool noErrors = SharingLogic.HandleErrors(() => success = SharingLogic.ShareChanges(new[] { sharedProj }.ToList(), source as InternetSharedRepositorySource,
                out results, list));
            Console.WriteLine($"S/R complete. NoErrors? {noErrors}");
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
                SFProject correspondingSfProject = existingSfProjects.FirstOrDefault(sfProj => sfProj.ParatextId == remotePtProject.SendReceiveId);

                bool sfProjectExists = correspondingSfProject != null;
                bool sfUserIsOnSfProject = correspondingSfProject?.UserRoles.ContainsKey(userSecret.Id) ?? false;
                bool adminOnPtProject = remotePtProject.SourceUsers.GetRole("the_username") == UserRoles.Administrator; // TODO Fetch and use actual PT username.
                bool ptProjectIsConnectable = (sfProjectExists && !sfUserIsOnSfProject) || (!sfProjectExists && adminOnPtProject);

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

        /// <summary>Fetch paratext projects that userSecret has access to.</summary>
        private async Task<IReadOnlyList<ParatextProject>> GetProjectsOrigAsync(UserSecret userSecret)
        {
            //seems to work in production
            var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
            Claim usernameClaim = accessToken.Claims.FirstOrDefault(c => c.Type == "username");
            string username = usernameClaim?.Value;
            // var source = new SFInternetSharedRepositorySource(_useDevServer, userSecret);
            var source = GetInternetSharedRepositorySource(userSecret);
            var repos = new Dictionary<string, UserRoles>();
            foreach (SharedRepository repo in source.GetRepositories())
            {
                string projId = repo.SendReceiveId;
                repos[projId] = repo.SourceUsers.GetRole(username);
            }
            Dictionary<string, SFProject> existingProjects = (_realtimeService.QuerySnapshots<SFProject>()
                .Where(p => repos.Keys.Contains(p.ParatextId))
                .ToList()).ToDictionary(p => p.ParatextId);
            // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
            string response = await CallApiAsync(_registryClient, userSecret, HttpMethod.Get, "projects");
            var projectArray = JArray.Parse(response);
            var projects = new List<ParatextProject>();
            foreach (JToken projectObj in projectArray)
            {
                JToken identificationObj = projectObj["identification_systemId"]
                    .FirstOrDefault(id => (string)id["type"] == "paratext");
                if (identificationObj == null)
                    continue;
                string paratextId = (string)identificationObj["text"];
                if (!repos.TryGetValue(paratextId, out UserRoles role))
                    continue;

                // determine if the project is connectable, i.e. either the project exists and the user hasn't been
                // added to the project, or the project doesn't exist and the user is the administrator
                bool isConnectable;
                bool isConnected = false;
                string projectId = null;
                if (existingProjects.TryGetValue(paratextId, out SFProject project))
                {
                    projectId = project.Id;
                    isConnected = true;
                    isConnectable = !project.UserRoles.ContainsKey(userSecret.Id);
                }
                else if (role == UserRoles.Administrator)
                {
                    isConnectable = true;
                }
                else
                {
                    isConnectable = false;
                }

                projects.Add(new ParatextProject
                {
                    ParatextId = paratextId,
                    Name = (string)projectObj["identification_name"],
                    ShortName = (string)projectObj["identification_shortName"],
                    LanguageTag = (string)projectObj["language_ldml"],
                    SFProjectId = projectId,
                    IsConnectable = isConnectable,
                    IsConnected = isConnected
                });
            }
            return projects.OrderBy(p => p.Name, StringComparer.InvariantCulture).ToArray();
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
        {//works in production
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

        public IReadOnlyList<int> GetBooks(string projectId)
        {
            ScrText scrText = _scrTextCollectionRunner.FindById(projectId);
            if (scrText == null)
                return Array.Empty<int>();
            return scrText.Settings.BooksPresentSet.SelectedBookNumbers.ToArray();
        }

        private bool IsManagingProject(string paratextProjectId)
        {
            return null != _scrTextCollectionRunner.FindById(paratextProjectId);
        }

        private void PullRepo(UserSecret userSecret, string projectId)
        {
            // projectId is the paratextId of the project.
            var repo = Path.Combine(SyncDir, projectId);
            if (!Directory.Exists(repo))
            {
                Directory.CreateDirectory(repo);
                Hg.Default.Init(repo);
            }
            var source = GetInternetSharedRepositorySource(userSecret);
            if (source == null)
                return;
            var repositories = source.GetRepositories();
            var repoInfo = source.GetRepositories().FirstOrDefault(x => x.SendReceiveId == projectId);

            source.Pull(repo, new SharedRepository(projectId, repoInfo.SendReceiveId, RepositoryType.Shared));

            Hg.Default.Update(repo);
        }

        // TODO append Async to method name.
        /// <summary>Get PT book in USX, or throw if can't.</summary>
        public async Task<string> GetBookText(UserSecret userSecret, string ptProjectId, int bookNum)
        {
            ScrText scrText = _scrTextCollectionRunner.FindById(ptProjectId);
            if (scrText == null)
            {
                await CloneProjectRepoAsync(userSecret, ptProjectId);
                scrText = _scrTextCollectionRunner.FindById(ptProjectId);
                if (scrText == null)
                {
                    throw new DataNotFoundException("Can't get access to cloned project.");
                }
            }
            // Work around "Could not find encoder for code page 1252" problem in production.
            ReflectionHelper.SetField(scrText.Settings, "cachedEncoder", new HackStringEncoder());
            string usfm = scrText.GetText(bookNum);
            return UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
        }

        public void PutBookText(string projectId, int bookNum, string usx)
        {
            // TODO: this is a guess at how to implement this method
            ScrText scrText = _scrTextCollectionRunner.GetById(projectId);
            var doc = new XmlDocument
            {
                PreserveWhitespace = true
            };
            doc.LoadXml(usx);
            UsxFragmenter.FindFragments(scrText.ScrStylesheet(bookNum), doc.CreateNavigator(),
                XPathExpression.Compile("*[false()]"), out string usfm);
            scrText.PutText(bookNum, 0, false, usfm, null);
        }

        public string GetNotes(string projectId, int bookNum)
        {
            // TODO: get notes using CommentManager, see DataAccessServer.HandleNotesRequest for an example
            // should return some data structure instead of XML
            ScrText scrText = _scrTextCollectionRunner.FindById(projectId);
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
            ScrText scrText = _scrTextCollectionRunner.FindById(projectId);
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
                vText.Commit($"{nbrAddedComments} notes added and {nbrDeletedComments + nbrUpdatedComments} notes updated or deleted in synchronize", null, false, "User01");
                Trace.TraceInformation("{0} added {1} notes, updaed {2} notes and deleted {3} notes", "User01", nbrAddedComments, nbrUpdatedComments, nbrDeletedComments);
            }
            catch (Exception e)
            {
                Trace.TraceError("Exception while updating notes: {0}", e);
            }
        }


        public void SendReceive(UserSecret userSecret, IEnumerable<string> projectIds)
        {
            foreach (var projectId in projectIds)
            {
                if (!IsManagingProject(projectId))
                {
                    PullRepo(userSecret, projectId);
                }
            }
            ScrText scrText = _scrTextCollectionRunner.FindById(projectIds.First());


            // BEGIN HACK
            ReflectionHelper.SetField(scrText.Settings, "cachedEncoder", new HackStringEncoder());
            // END HACK

            // TODO: this is a guess at how to implement this method
            var source = new SFInternetSharedRepositorySource(_useDevServer, userSecret);
            SharedRepository[] repos = source.GetRepositories().ToArray();
            var sharedProjects = new List<SharedProject>();
            foreach (string projectId in projectIds)
            {
                SharedRepository repo = repos.First(r => r.SendReceiveId == projectId); // todo what if not found.
                SharedProject sharedProject = SharingLogic.CreateSharedProject(projectId, repo.ScrTextName, source,
                    repos);
                sharedProjects.Add(sharedProject);
            }


            SharingLogic.ShareChanges(sharedProjects, source, out List<SendReceiveResult> results, sharedProjects);
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

        protected override void DisposeManagedResources()
        {
            _registryClient.Dispose();
            _httpClientHandler.Dispose();
        }

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
    }
}
