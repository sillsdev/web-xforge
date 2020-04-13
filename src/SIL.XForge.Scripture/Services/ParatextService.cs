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

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
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
        internal string _jwt;
        private Dictionary<string, InternetSharedRepositorySource> _internetSharedRepositorySource = new Dictionary<string, InternetSharedRepositorySource>();



        /// <summary>Entry point for testing so can consistently isolate and test the same thing.</summary>
        public async Task DevEntryPoint(UserSecret userSecret)
        {
            Console.WriteLine("Begin DevEntryPoint.");
            await RefreshAccessTokenAsync(userSecret);
            Init();
            RegisterWithJWT(userSecret);

            // TODO Use an appropriate string for the clone path. Such as the paratext project id (not the SF project id).
            var dir = "repoCloneDir";
            PullRepo2(userSecret, Path.Combine(SyncDir, dir));
            InitializeProjects(SyncDir);
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
        }

        public void RegisterWithJWT(UserSecret userSecret)
        {
            var jwtToken = userSecret.ParatextTokens.AccessToken;
            if (jwtToken?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ?? false)
                jwtToken = jwtToken.Substring("Bearer ".Length).Trim();

            _jwt = jwtToken;
            // TODO Do we need to do additional validation? cli used Jose.JWT.Decode...

            // var jwtRESTClient = new JwtRESTClient(/*InternetAccess.RegistryServer*/ /*"https://registry.paratext.org/api8/"*/_registryClient.BaseAddress.AbsoluteUri, ApplicationProduct.DefaultVersion, jwtToken);
            var jwtRESTClient = new JwtRESTClient(/*InternetAccess.RegistryServer*/ "https://registry-dev.paratext.org/api8/", ApplicationProduct.DefaultVersion, jwtToken);
            RegistryServer.Initialize(applicationProductVersion, jwtRESTClient);
            jwtRegistered = true;
        }

        private void SetupMercurial()
        {
            if (Hg.Default != null)
            {
                return;
            }
            // TODO: production server will presumably use /usr/bin/hg. Tho running from PATH would be good .
            var hgExe = "/usr/local/bin/hg";
            var hgMerge = Path.Combine("/home/vagrant/src/web-xforge", "ParatextMerge.py");
            Hg.Default = new Hg(hgExe, hgMerge, SyncDir);
        }

        private void InitializeProjects(string path)
        {
            WritingSystemRepository.Initialize();

            // TODO: not sure if using ScrTextCollection is the best idea for a server, since it loads all existing
            // ScrTexts into memory when it is initialized. Possibly use a different implementation, see
            // ScrTextCollectionServer class in DataAccessServer.
            _scrTextCollectionRunner.Initialize(SyncDir, false);

            string usfmStylesFileName = "usfm.sty";
            string pathToStyle = Path.Combine("/home/vagrant/src/web-xforge/src/SIL.XForge.Scripture", usfmStylesFileName);
            string target = Path.Combine(SyncDir, usfmStylesFileName);
            if (!File.Exists(target))
            {
                File.Copy(pathToStyle, target);
            }
            if (!File.Exists(SyncDir + "/revisionStyle.sty"))
            {
                File.Copy("/home/vagrant/src/web-xforge/revisionStyle.sty", SyncDir);
            }

            if (!File.Exists(SyncDir + "/revisionTemplate.tem"))
            {
                File.Copy("/home/vagrant/src/web-xforge/revisionTemplate.tem", SyncDir);
            }
        }

        /// <summary>(Learning/experimenting by writing clone anew)</summary>
        public void PullRepo2(UserSecret userSecret, string newRepoPath) // todo rename to clone?
        {
            if (!Directory.Exists(newRepoPath))
            {
                Directory.CreateDirectory(newRepoPath);
                Hg.Default.Init(newRepoPath);
            }

            var tmpTuple = GetListOfProjects();
            var repos = tmpTuple.Item2;
            var jwtSource = tmpTuple.Item1;
            var theRepo = repos.FirstOrDefault(r => r.ScrTextName == "Ott");
            var projectName = theRepo.ScrTextName;
            var sharedRepository = new SharedRepository(projectName, theRepo.SendReceiveId, RepositoryType.Shared);
            jwtSource.Pull(newRepoPath, sharedRepository);
            Hg.Default.Update(newRepoPath);

        }

        /// <summary>(Learning/experimenting by writing Sendreceive anew)</summary>
        public void SendReceive2(UserSecret userSecret)
        {
            ScrText scrText = _scrTextCollectionRunner.FindById("94f48e5b710ec9e092d9a7ec2d124c30f33a04bf");


            // BEGIN HACK
            ReflectionHelper.SetField(scrText.Settings, "cachedEncoder", new HackStringEncoder());
            // END HACK

            string repoPath = "/var/lib/scriptureforge/sync/repoCloneDir";

            var source = GetInternetSharedRepositorySource(userSecret);
            var repositories = source.GetRepositories();


            SharedProject sharedProj = SharingLogic.CreateSharedProject(scrText.Guid, "Ott", source, repositories);


            List<SendReceiveResult> results = Enumerable.Empty<SendReceiveResult>().ToList();
            var list = new[] { sharedProj }.ToList();
            bool success = false;
            bool noErrors = SharingLogic.HandleErrors(() => success = SharingLogic.ShareChanges(new[] { sharedProj }.ToList(), source,
                out results, list));
            Console.WriteLine($"S/R complete. NoErrors? {noErrors}");
        }

        /// <summary>Fetch paratext projects that userSecret has access to. (re-writing in environment of present understanding of how to connect to Paratext.Data)</summary>
        public async Task<IReadOnlyList<ParatextProject>> GetProjects2Async(UserSecret userSecret)
        {
            throw new NotImplementedException();

        }

        public Tuple<IInternetSharedRepositorySource, IEnumerable<SharedRepository>> GetListOfProjects()
        {
            var jwtSource = new JwtInternetSharedRepositorySource();
            jwtSource.SetToken(_jwt);
            // var repoSource = GetInternetSharedRepositorySource(userSecret);
            var repos = GetListOfProjects2(jwtSource);
            return new Tuple<IInternetSharedRepositorySource, IEnumerable<SharedRepository>>(jwtSource, repos);
        }

        public IEnumerable<SharedRepository> GetListOfProjects2(IInternetSharedRepositorySource repositorySource)
        {
            return repositorySource.GetRepositories();
        }

        /// <summary>Fetch paratext projects that userSecret has access to.</summary>
        public async Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret)
        {
            //seems to work in production
            var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
            Claim usernameClaim = accessToken.Claims.FirstOrDefault(c => c.Type == "username");
            string username = usernameClaim?.Value;
            var source = new SFInternetSharedRepositorySource(_useDevServer, userSecret);
            var repos = new Dictionary<string, UserRoles>();
            foreach (SharedRepository repo in source.GetRepositories())
            {
                string projId = repo.SendReceiveId;
                repos[projId] = repo.SourceUsers.GetRole(username);
            }
            Dictionary<string, SFProject> existingProjects = (await _realtimeService.QuerySnapshots<SFProject>()
                .Where(p => repos.Keys.Contains(p.ParatextId))
                .ToListAsync()).ToDictionary(p => p.ParatextId);
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
                    ProjectId = projectId,
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
            // Initialize
            if (!jwtRegistered)
                RegisterWithJWT(userSecret);
            // projectId is the paratextId of the project.
            var repo = Path.Combine(SyncDir, projectId);
            if (!Directory.Exists(repo))
            {
                Directory.CreateDirectory(repo);
                Hg.Default.Init(repo);
            }
            var source = GetInternetSharedRepositorySource(userSecret);
            var repositories = source.GetRepositories();
            // Still cant get repositories for Raymond
            var repoInfo = source.GetRepositories().FirstOrDefault(x => x.SendReceiveId == projectId);
            if (source == null)
                return;

            source.Pull(repo, new SharedRepository(projectId, repoInfo.SendReceiveId, RepositoryType.Shared));

            Hg.Default.Update(repo);
        }



        public string GetBookText(UserSecret userSecret, string paratextProjectId, int bookNum)
        {
            if (!IsManagingProject(paratextProjectId))
            {
                // TODO or throw?
                // TODO isnt this an older method that we shouldnt be calling now?
                PullRepo(userSecret, paratextProjectId);
            }

            // TODO: this is a guess at how to implement this method
            ScrText scrText = _scrTextCollectionRunner.GetById(paratextProjectId);
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
            throw new NotImplementedException();
        }

        public void PutNotes(string projectId, string notesText)
        {
            // TODO: save notes using CommentManager, see DataAccessServer.HandleNotesUpdateRequest for an example
            // should accept some data structure instead of XML
            throw new NotImplementedException();
        }


        // StringsEncoder class doesn't work on dotnet core because it assumes 1252 is available.
        // On dotnet core 1252 will never return from Encodings.GetEncodings(),
        // but StringsEncoder assumes it does.
        private class HackStringEncoder : StringEncoder
        {
            public HackStringEncoder()
            {

            }

            public override string ShortName => "utf8";

            public override string LongName => "utf8";

            public override string Convert(byte[] data, out string errorMessage)
            {
                errorMessage = "";
                return Encoding.UTF8.GetString(data, 0, data.Length);
            }

            public override byte[] Convert(string text, out string errorMessage)
            {
                errorMessage = "";
                return Encoding.UTF8.GetBytes(text.ToArray(), 0, text.Length);
            }

            public override void InstallInProject(ScrText scrText)
            {

            }

            protected override bool Equals(StringEncoder other)
            {
                return other != null && other.LongName == this.LongName;
            }

            protected override bool Equals(int codePage)
            {
                return true;
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

        private InternetSharedRepositorySource GetInternetSharedRepositorySource(UserSecret userSecret)
        {
            if (!_internetSharedRepositorySource.ContainsKey(userSecret.Id))
            {
                _internetSharedRepositorySource[userSecret.Id] = new SFInternetSharedRepositorySource(_useDevServer, userSecret);
            }

            return _internetSharedRepositorySource[userSecret.Id];
        }
    }
}
