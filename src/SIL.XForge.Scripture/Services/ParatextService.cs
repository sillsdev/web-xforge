using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Claims;
using System.Text;
using System.Threading;
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
using Paratext.Data.ProjectComments;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
using SIL.ObjectModel;
using SIL.Scripture;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

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
        private readonly IJwtTokenHelper _jwtTokenHelper;
        private readonly IParatextDataHelper _paratextDataHelper;
        private readonly IGuidService _guidService;
        private string _dblServerUri = "https://paratext.thedigitalbiblelibrary.org/";
        private string _registryServerUri = "https://registry.paratext.org";
        private string _sendReceiveServerUri = InternetAccess.uriProduction;
        private readonly IInternetSharedRepositorySourceProvider _internetSharedRepositorySourceProvider;
        private readonly ISFRestClientFactory _restClientFactory;
        /// <summary> Map user IDs to semaphores </summary>
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _tokenRefreshSemaphores =
            new ConcurrentDictionary<string, SemaphoreSlim>();
        private readonly IHgWrapper _hgHelper;
        private readonly IWebHostEnvironment _env;

        public ParatextService(IWebHostEnvironment env, IOptions<ParatextOptions> paratextOptions,
            IRepository<UserSecret> userSecretRepository, IRealtimeService realtimeService,
            IExceptionHandler exceptionHandler, IOptions<SiteOptions> siteOptions, IFileSystemService fileSystemService,
            ILogger<ParatextService> logger, IJwtTokenHelper jwtTokenHelper, IParatextDataHelper paratextDataHelper,
            IInternetSharedRepositorySourceProvider internetSharedRepositorySourceProvider, IGuidService guidService,
            ISFRestClientFactory restClientFactory, IHgWrapper hgWrapper)
        {
            _paratextOptions = paratextOptions;
            _userSecretRepository = userSecretRepository;
            _realtimeService = realtimeService;
            _exceptionHandler = exceptionHandler;
            _siteOptions = siteOptions;
            _fileSystemService = fileSystemService;
            _logger = logger;
            _jwtTokenHelper = jwtTokenHelper;
            _paratextDataHelper = paratextDataHelper;
            _internetSharedRepositorySourceProvider = internetSharedRepositorySourceProvider;
            _guidService = guidService;
            _restClientFactory = restClientFactory;
            _hgHelper = hgWrapper;
            _env = env;

            _httpClientHandler = new HttpClientHandler();
            _registryClient = new HttpClient(_httpClientHandler);
            if (env.IsDevelopment() || env.IsEnvironment("Testing"))
            {
                _httpClientHandler.ServerCertificateCustomValidationCallback
                    = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
                // This should be paratext-qa.thedigitalbiblelibrary.org, but it's broken as of 2021-04 and
                // qa.thedigitalbiblelibrary.org should be just as good, at least for the time being.
                _dblServerUri = "https://qa.thedigitalbiblelibrary.org/";
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

        /// <summary> Path to cloned PT project Mercurial repos. </summary>
        public string SyncDir { get; set; }

        internal IScrTextCollection ScrTextCollection { get; set; }
        internal ISharingLogicWrapper SharingLogicWrapper { get; set; }

        /// <summary> Prepare access to Paratext.Data library, authenticate, and prepare Mercurial. </summary>
        public void Init()
        {
            // Uncomment to output more info to the Terminal from ParatextData.dll for investigating. Note that without
            // Clear()ing, the output would show in Debug Console while debugging.
            // The output is using System.Diagnostics.Trace and so is not managed by the ILogging LogLevel filtering
            // settings.
            // System.Diagnostics.Trace.Listeners.Add(new System.Diagnostics.TextWriterTraceListener(Console.Out));
            // System.Diagnostics.Trace.AutoFlush = true;

            // Stop ParatextData.dll Trace output from appearing on the server.
            System.Diagnostics.Trace.Listeners.Clear();

            SyncDir = Path.Combine(_siteOptions.Value.SiteDir, "sync");
            if (!_fileSystemService.DirectoryExists(SyncDir))
                _fileSystemService.CreateDirectory(SyncDir);
            // Disable caching VersionedText instances since multiple repos may exist on SF server with the same GUID
            Environment.SetEnvironmentVariable("PTD_CACHE_VERSIONED_TEXT", "DISABLED");
            RegistryU.Implementation = new DotNetCoreRegistry();
            Alert.Implementation = new DotNetCoreAlert(_logger);
            ParatextDataSettings.Initialize(new PersistedParatextDataSettings());
            PtxUtilsDataSettings.Initialize(new PersistedPtxUtilsSettings());
            SetupMercurial();
            WritingSystemRepository.Initialize();
            ScrTextCollection.Initialize(SyncDir);
            InstallStyles();
            // Allow use of custom versification systems
            Versification.Table.Implementation = new ParatextVersificationTable();
        }

        /// <summary>
        /// Synchronizes the text and notes data on the SF server with the data on the Paratext server, for the PT
        /// project referred to by paratextId. Or if paratextId refers to a DBL Resource, update the local copy of the
        /// resource if needed.
        /// </summary>
        public async Task SendReceiveAsync(UserSecret userSecret, string paratextId,
            IProgress<ProgressState> progress = null, CancellationToken token = default)
        {
            if (userSecret == null || paratextId == null) { throw new ArgumentNullException(); }

            IInternetSharedRepositorySource source = await GetInternetSharedRepositorySource(userSecret.Id, token);
            IEnumerable<SharedRepository> repositories = GetRepositories(source,
                $"For SF user id {userSecret.Id}, while attempting to sync PT project id {paratextId}.");
            IEnumerable<ProjectMetadata> projectsMetadata = source.GetProjectsMetaData();
            IEnumerable<string> projectGuids = projectsMetadata.Select(pmd => pmd.ProjectGuid.Id);
            SharedRepository sendReceiveRepository = repositories.FirstOrDefault(r => r.SendReceiveId.Id == paratextId);
            ParatextProject ptProject;
            if (TryGetProject(userSecret, sendReceiveRepository, projectsMetadata, out ptProject))
            {
                if (!projectGuids.Contains(paratextId))
                    _logger.LogWarning($"The project with PT ID {paratextId} did not have a full name available.");
            }
            else
            {
                // See if this is a resource
                IReadOnlyList<ParatextResource> resources =
                    await this.GetResourcesInternalAsync(userSecret.Id, true, token);
                ptProject = resources.SingleOrDefault(r => r.ParatextId == paratextId);
            }

            if (ptProject == null)
            {
                throw new ArgumentException(
                    "PT projects with the following PT ids were requested but without access or they don't exist: "
                        + $"{paratextId}");
            }
            EnsureProjectReposExists(userSecret, ptProject, source);
            StartProgressReporting(progress);
            if (!(ptProject is ParatextResource))
            {
                SharedProject sharedProj = CreateSharedProject(userSecret, paratextId,
                    ptProject.ShortName, source.AsInternetSharedRepositorySource(), sendReceiveRepository);
                List<SharedProject> sharedPtProjectsToSr = new List<SharedProject> { sharedProj };

                // If we are in development, unlock the repo before we begin,
                // just in case the repo is locked.
                if (_env.IsDevelopment())
                {
                    try
                    {
                        source.UnlockRemoteRepository(sharedProj.Repository);
                    }
                    catch (HttpException)
                    {
                        // A 403 error will be thrown if the repo is not locked
                    }
                }

                // TODO report results
                List<SendReceiveResult> results = Enumerable.Empty<SendReceiveResult>().ToList();
                bool success = false;
                bool noErrors = SharingLogicWrapper.HandleErrors(() => success = SharingLogicWrapper
                    .ShareChanges(sharedPtProjectsToSr, source.AsInternetSharedRepositorySource(),
                    out results, sharedPtProjectsToSr));
                if (results == null)
                {
                    _logger.LogWarning($"SendReceive results are unexpectedly null.");
                }
                if (results != null && results.Any(r => r == null))
                {
                    _logger.LogWarning($"SendReceive results unexpectedly contained a null result.");
                }
                string srResultDescriptions = ExplainSRResults(results);
                _logger.LogInformation($"SendReceive results: {srResultDescriptions}");
                if (!noErrors || !success ||
                    (results != null &&
                        results.Any(r => r != null && r.Result == SendReceiveResultEnum.Failed)))
                {
                    string resultsInfo = ExplainSRResults(results);
                    throw new InvalidOperationException(
                        $"Failed: Errors occurred while performing the sync with the Paratext Server. More information: noErrors: {noErrors}. success: {success}. null results: {results == null}. results: {resultsInfo}");
                }
            }
        }

        /// <summary> Get Paratext projects that a user has access to. </summary>
        public async Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret)
        {
            IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(userSecret.Id,
                CancellationToken.None);
            IEnumerable<SharedRepository> remotePtProjects = GetRepositories(ptRepoSource,
                $"Using SF user id {userSecret.Id}");
            return GetProjects(userSecret, remotePtProjects, ptRepoSource.GetProjectsMetaData());
        }

        /// <summary>Get Paratext resources that a user has access to. </summary>
        public async Task<IReadOnlyList<ParatextResource>> GetResourcesAsync(string userId)
        {
            return await this.GetResourcesInternalAsync(userId, false, CancellationToken.None);
        }

        /// <summary>
        /// Is the PT project referred to by `paratextId` a DBL resource?
        /// </summary>
        public bool IsResource(string paratextId)
        {
            return paratextId?.Length == SFInstallableDblResource.ResourceIdentifierLength;
        }

        /// <summary>
        /// Returns `userSecret`'s role on a PT project according to the PT Registry.
        /// </summary>
        public async Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId,
            CancellationToken token)
        {
            if (userSecret == null || string.IsNullOrEmpty(paratextId))
            {
                return Attempt.Failure((string)null);
            }
            // Ensure the user has the paratext access tokens, and this is not a resource
            if (userSecret.ParatextTokens == null || IsResource(paratextId))
            {
                return Attempt.Failure((string)null);
            }
            else if (await IsRegisteredAsync(userSecret, paratextId, token))
            {
                // Use the registry server
                try
                {
                    var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
                    Claim subClaim = accessToken.Claims.FirstOrDefault(c => c.Type == JwtClaimTypes.Subject);
                    // Paratext RegistryServer has methods to do this, but it is unreliable to use it in a multi-user
                    // environment so instead we call the registry API.
                    string response = await CallApiAsync(userSecret, HttpMethod.Get,
                        $"projects/{paratextId}/members/{subClaim.Value}", null, token);
                    var memberObj = JObject.Parse(response);
                    return Attempt.Success((string)memberObj["role"]);
                }
                catch (HttpRequestException)
                {
                    return Attempt.Failure((string)null);
                }
            }
            else
            {
                // We will use the repository to get the project role for this user, as back translations inherit the
                // base project registration, so are not in the registry.
                IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(userSecret.Id,
                    CancellationToken.None);
                IEnumerable<SharedRepository> remotePtProjects = GetRepositories(ptRepoSource,
                    $"For SF user id {userSecret.Id} for unregistered PT project id {paratextId}");
                string username = GetParatextUsername(userSecret);
                string role =
                    ConvertFromUserRole(remotePtProjects.SingleOrDefault(p => p.SendReceiveId.Id == paratextId)
                    ?.SourceUsers.Users.FirstOrDefault(u => u.UserName == username)?.Role);
                if (string.IsNullOrEmpty(role))
                {
                    return Attempt.Failure(role);
                }
                else
                {
                    return Attempt.Success(role);
                }
            }
        }

        /// <summary> Get the Paratext username from the UserSecret. </summary>
        public string GetParatextUsername(UserSecret userSecret)
        {
            return _jwtTokenHelper.GetParatextUsername(userSecret);
        }

        /// <summary>
        /// Gets the permission a user has to access a resource, according to a DBL server.
        /// </summary>
        /// <param name="paratextId">The paratext resource identifier.</param>
        /// <param name="userId">The user identifier.</param>
        /// <returns>
        /// Read or None.
        /// </returns>
        /// <remarks>
        /// See <see cref="TextInfoPermission" /> for permission values.
        /// </remarks>
        public async Task<string> GetResourcePermissionAsync(string paratextId, string userId,
            CancellationToken token)
        {
            // See if the source is even a resource
            if (!IsResource(paratextId))
            {
                // Default to no permissions for projects used as sources
                return TextInfoPermission.None;
            }
            using (ParatextAccessLock accessLock = await GetParatextAccessLock(userId, token))
            {
                bool canRead = SFInstallableDblResource.CheckResourcePermission(
                        paratextId,
                        accessLock.UserSecret,
                        _paratextOptions.Value,
                        _restClientFactory,
                        _fileSystemService,
                        _jwtTokenHelper,
                        _exceptionHandler,
                        _dblServerUri);
                return canRead ? TextInfoPermission.Read : TextInfoPermission.None;
            }
        }

        private string ExplainSRResults(IEnumerable<SendReceiveResult> srResults)
        {
            return string.Join(";",
                srResults?.Select((SendReceiveResult r) =>
                    $"SR result: {r.Result.ToString()}, " +
                    $"Revisions sent: {string.Join(",", r.RevisionsSent ?? Enumerable.Empty<string>())}, " +
                    $"Revisions received: {string.Join(",", r.RevisionsReceived ?? Enumerable.Empty<string>())}, " +
                    $"Failure message: {r.FailureMessage}.")
                ?? Enumerable.Empty<string>());
        }

        private void WarnIfNonuniqueValues(Dictionary<string, string> sfUserIdToPTUsernameMap, string context)
        {
            IEnumerable<KeyValuePair<string, string>> recordsWithNonuniqueValues =
                sfUserIdToPTUsernameMap.Where((KeyValuePair<string, string> record) =>
                    sfUserIdToPTUsernameMap.Values.Count(val => val == record.Value) > 1);
            if (recordsWithNonuniqueValues.Count() > 0)
            {
                string display = string.Join(", ",
                    recordsWithNonuniqueValues.Select(record => $"{record.Key}: {record.Value}"));
                _logger.LogWarning(
                    $"Warning: The PT Username mapping contains multiple records with duplicate values. The following records have values that occur more than once: {display}. {context}");
            }
        }

        /// <summary>
        /// Queries the ParatextRegistry for the project and builds a dictionary of SF user id
        /// to paratext user names for members of the project.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="project">The project - the UserRoles and ParatextId are used.</param>
        /// <param name="token">The cancellation token.</param>
        /// <returns>
        /// A dictionary where the key is the SF user ID and the value is Paratext username. (May be empty)
        /// </returns>
        public async Task<IReadOnlyDictionary<string, string>> GetParatextUsernameMappingAsync(UserSecret userSecret,
            SFProject project, CancellationToken token)
        {
            // Skip all the work if the project is a resource. Resources don't have project members
            if (IsResource(project.ParatextId))
            {
                return new Dictionary<string, string>();
            }
            else if (await IsRegisteredAsync(userSecret, project.ParatextId, token))
            {
                // Get the mapping for paratext users ids to usernames from the registry
                string response = await CallApiAsync(userSecret, HttpMethod.Get,
                $"projects/{project.ParatextId}/members", null, token);
                Dictionary<string, string> paratextMapping = JArray.Parse(response).OfType<JObject>()
                    .Where(m => !string.IsNullOrEmpty((string)m["userId"])
                        && !string.IsNullOrEmpty((string)m["username"]))
                    .ToDictionary(m => (string)m["userId"], m => (string)m["username"]);

                // Get the mapping of Scripture Forge user IDs to Paratext usernames
                Dictionary<string, string> userMapping = await this._realtimeService.QuerySnapshots<User>()
                    .Where(u => paratextMapping.Keys.Contains(u.ParatextId))
                    .ToDictionaryAsync(u => u.Id, u => paratextMapping[u.ParatextId]);

                WarnIfNonuniqueValues(userMapping,
                    $"This occurred while SF user id '{userSecret.Id}' was querying registered PT project id '{project.ParatextId}' (SF project id '{project.Id}').");
                return userMapping;
            }
            else
            {
                // Get the list of users from the repository
                IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(userSecret.Id,
                    CancellationToken.None);

                bool hasRole = project.UserRoles.TryGetValue(userSecret.Id, out string userRole);
                string contextInformation = $"For SF user id '{userSecret.Id}', "
                    + $"while interested in unregistered PT project id '{project.ParatextId}' "
                    + $"(SF project id {project.Id}). "
                    + $"On SF project, user has {(hasRole ? $"role '{userRole}'." : "no role.")}";

                IEnumerable<SharedRepository> remotePtProjects = GetRepositories(ptRepoSource, contextInformation);
                SharedRepository remotePtProject =
                    remotePtProjects.Single(p => p.SendReceiveId.Id == project.ParatextId);

                // Build a dictionary of user IDs mapped to usernames using the user secrets
                var userMapping = new Dictionary<string, string>();
                foreach (string userId in project.UserRoles.Keys)
                {
                    UserSecret projectUserSecret;
                    if (userId == userSecret.Id)
                    {
                        projectUserSecret = userSecret;
                    }
                    else
                    {
                        projectUserSecret = await _userSecretRepository.GetAsync(userId);
                    }

                    string projectUserName = GetParatextUsername(projectUserSecret);
                    if (remotePtProject.SourceUsers.UserNames.Contains(projectUserName))
                    {
                        userMapping.Add(userId, projectUserName);
                    }
                }

                WarnIfNonuniqueValues(userMapping,
                    $"This occurred while SF user id '{userSecret.Id}' was querying unregistered PT project id '{project.ParatextId}' (SF project id '{project.Id}').");
                return userMapping;
            }
        }

        /// <summary>
        /// Gets the permissions for a project or resource.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="project">The project - the UserRoles and ParatextId are used.</param>
        /// <param name="ptUsernameMapping">A mapping of user ID to Paratext username.</param>
        /// <param name="book">The book number. Set to zero to check for all books.</param>
        /// <param name="chapter">The chapter number. Set to zero to check for all books.</param>
        /// <returns>
        /// A dictionary of permissions where the key is the user ID and the value is the permission.
        /// </returns>
        /// <remarks>
        /// See <see cref="TextInfoPermission" /> for permission values.
        /// A dictionary is returned, as permissions can be updated.
        /// </remarks>
        public async Task<Dictionary<string, string>> GetPermissionsAsync(UserSecret userSecret, SFProject project,
            IReadOnlyDictionary<string, string> ptUsernameMapping, int book = 0, int chapter = 0,
            CancellationToken token = default)
        {
            var permissions = new Dictionary<string, string>();

            if (IsResource(project.ParatextId))
            {
                foreach (string uid in project.UserRoles.Keys)
                {
                    permissions.Add(uid, await this.GetResourcePermissionAsync(project.ParatextId, uid, token));
                }
            }
            else
            {
                // Get the scripture text so we can retrieve the permissions from the XML
                using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), project.ParatextId);

                // Calculate the project and resource permissions
                foreach (string uid in project.UserRoles.Keys)
                {
                    // See if the user is in the project members list
                    if (!ptUsernameMapping.TryGetValue(uid, out string userName) || string.IsNullOrWhiteSpace(userName)
                        || scrText.Permissions.GetRole(userName) == Paratext.Data.Users.UserRoles.None)
                    {
                        permissions.Add(uid, TextInfoPermission.None);
                    }
                    else
                    {
                        string textInfoPermission = TextInfoPermission.Read;
                        if (book == 0)
                        {
                            // Project level
                            if (scrText.Permissions.CanEditAllBooks(userName))
                            {
                                textInfoPermission = TextInfoPermission.Write;
                            }
                        }
                        else if (chapter == 0)
                        {
                            // Book level
                            IEnumerable<int> editable = scrText.Permissions.GetEditableBooks(
                                Paratext.Data.Users.PermissionSet.Merged, userName);
                            if (editable == null || !editable.Any())
                            {
                                // If there are no editable book permissions, check if they can edit all books
                                if (scrText.Permissions.CanEditAllBooks(userName))
                                {
                                    textInfoPermission = TextInfoPermission.Write;
                                }
                            }
                            else if (editable.Contains(book))
                            {
                                textInfoPermission = TextInfoPermission.Write;
                            }
                        }
                        else
                        {
                            // Chapter level
                            IEnumerable<int> editable = scrText.Permissions.GetEditableChapters(book,
                                scrText.Settings.Versification, userName, Paratext.Data.Users.PermissionSet.Merged);
                            if (editable?.Contains(chapter) ?? false)
                            {
                                textInfoPermission = TextInfoPermission.Write;
                            }
                        }

                        permissions.Add(uid, textInfoPermission);
                    }
                }
            }

            return permissions;
        }

        /// <summary>
        /// Helper method to fetch repositories, and log when there is a problem. The available contextual information
        /// varies among usages, so it is passed in via string.
        /// </summary>
        private IEnumerable<SharedRepository> GetRepositories(IInternetSharedRepositorySource ptRepoSource,
            string contextInformation)
        {
            try
            {
                return ptRepoSource.GetRepositories();
            }
            catch (HttpException e)
            {
                string message = $"Problem fetching repositories: {contextInformation}";
                _logger.LogWarning(e, message);
                throw;
            }
        }

        /// <summary>
        /// Gets the project roles asynchronously.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="project">The project - the UserRoles and ParatextId are used.</param>
        /// <param name="token">The cancellation token.</param>
        /// <returns>
        /// A dictionary where the key is the PT user ID and the value is the PT role.
        /// </returns>
        public async Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(UserSecret userSecret,
            SFProject project, CancellationToken token)
        {
            if (IsResource(project.ParatextId))
            {
                // Resources do not have roles
                return new Dictionary<string, string>();
            }
            else if (await IsRegisteredAsync(userSecret, project.ParatextId, token))
            {
                // Paratext RegistryServer has methods to do this, but it is unreliable to use it in a multi-user
                // environment so instead we call the registry API.
                string response = await CallApiAsync(userSecret, HttpMethod.Get,
                    $"projects/{project.ParatextId}/members", null, token);
                var members = JArray.Parse(response);
                return members.OfType<JObject>()
                    .Where(m => !string.IsNullOrEmpty((string)m["userId"]) && !string.IsNullOrEmpty((string)m["role"]))
                    .ToDictionary(m => (string)m["userId"], m => (string)m["role"]);
            }
            else
            {
                // Get the list of users from the repository
                IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(userSecret.Id,
                    CancellationToken.None);

                bool hasRole = project.UserRoles.TryGetValue(userSecret.Id, out string userRole);
                string moreInformation = $"SF user id '{userSecret.Id}', "
                    + $"while interested in unregistered PT project id '{project.ParatextId}' "
                    + $"(SF project id {project.Id}). "
                    + $"On SF project, user has {(hasRole ? $"role '{userRole}'." : "no role.")}";

                IEnumerable<SharedRepository> remotePtProjects =
                    GetRepositories(ptRepoSource, $"For {moreInformation}");
                SharedRepository remotePtProject =
                    remotePtProjects.SingleOrDefault(p => p.SendReceiveId.Id == project.ParatextId);
                if (remotePtProject == null)
                {
                    string projects = string.Join(",", remotePtProjects
                        .Select((SharedRepository r) => r.SendReceiveId.Id));
                    string message = $"Failed to find project, when looking in permissible set of repositories "
                        + $"of PT ids '{projects}', for {moreInformation}";
                    throw new ForbiddenException(message);
                }

                // Build a dictionary of user IDs mapped to roles using the user secrets
                var userMapping = new Dictionary<string, string>();
                foreach (string userId in project.UserRoles.Keys)
                {
                    // Reuse the userSecret if this is for the current user
                    UserSecret projectUserSecret;
                    if (userId == userSecret.Id)
                    {
                        projectUserSecret = userSecret;
                    }
                    else
                    {
                        projectUserSecret = await _userSecretRepository.GetAsync(userId);
                    }

                    // Get the PT role
                    string projectUserName = GetParatextUsername(projectUserSecret);
                    string role = ConvertFromUserRole(remotePtProject.SourceUsers.Users
                        .SingleOrDefault(u => u.UserName == projectUserName)?.Role);

                    // Get the PT user ID
                    var accessToken = new JwtSecurityToken(projectUserSecret.ParatextTokens.AccessToken);
                    string ptUserId = accessToken.Claims.FirstOrDefault(c => c.Type == JwtClaimTypes.Subject)?.Value;

                    // Only add if we have a user ID and role
                    if (!string.IsNullOrEmpty(ptUserId) && !string.IsNullOrEmpty(role))
                    {
                        userMapping.Add(ptUserId, role);
                    }
                }

                return userMapping;
            }
        }

        /// <summary> Gets basic settings for a Paratext project. </summary>
        /// <returns> The Paratext project settings, or null if the project repository does not exist locally </returns>
        public ParatextSettings GetParatextSettings(UserSecret userSecret, string paratextId)
        {
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
            if (scrText == null)
                return null;
            return new ParatextSettings
            {
                FullName = scrText.FullName,
                IsRightToLeft = scrText.RightToLeft,
                Editable = scrText.Settings.Editable
            };
        }

        /// <summary> Get list of book numbers in PT project. </summary>
        public IReadOnlyList<int> GetBookList(UserSecret userSecret, string paratextId)
        {
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
            if (scrText == null)
                return Array.Empty<int>();
            return scrText.Settings.BooksPresentSet.SelectedBookNumbers.ToArray();
        }

        /// <summary> Get PT book text in USX, or throw if can't. </summary>
        public string GetBookText(UserSecret userSecret, string paratextId, int bookNum)
        {
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
            if (scrText == null)
                throw new DataNotFoundException("Can't get access to cloned project.");
            string usfm = scrText.GetText(bookNum);
            return UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
        }

        /// <summary> Write up-to-date book text from mongo database to Paratext project folder. </summary>
        /// <remarks> It is up to the caller to determine whether the project text is editable. </remarks>
        public async Task PutBookText(UserSecret userSecret, string projectPTId, int bookNum, string usx,
            Dictionary<int, string> chapNumToAuthorUserSFIdMap = null)
        {
            if (userSecret == null)
            {
                throw new ArgumentNullException(nameof(userSecret));
            }
            if (String.IsNullOrWhiteSpace(projectPTId))
            {
                throw new ArgumentException(nameof(projectPTId));
            }

            StringBuilder log = new StringBuilder($"ParatextService.PutBookText(userSecret, projectPTId {projectPTId}, bookNum {bookNum}, usx {usx}, chapterAuthors: {(chapNumToAuthorUserSFIdMap == null ? "null" : ($"count {chapNumToAuthorUserSFIdMap.Count}"))})");
            Dictionary<string, ScrText> scrTexts = new Dictionary<string, ScrText>();
            try
            {
                log.AppendLine($"Querying userSecret (id {userSecret.Id}, tokens null: {userSecret.ParatextTokens == null}) for username.");
                string username = GetParatextUsername(userSecret);
                log.AppendLine($"Acquired username: {(username == null ? "is null" : (username.Length == 0 ? "zero length" : "yes"))}");
                using ScrText scrText = ScrTextCollection.FindById(username, projectPTId);

                // We add this here so we can dispose in the finally
                scrTexts.Add(userSecret.Id, scrText);
                var doc = new XmlDocument
                {
                    PreserveWhitespace = true
                };
                doc.LoadXml(usx);
                log.AppendLine($"Imported string as XmlDocument with {doc.ChildNodes.Count} child nodes.");
                UsxFragmenter.FindFragments(scrText.ScrStylesheet(bookNum), doc.CreateNavigator(),
                    XPathExpression.Compile("*[false()]"), out string usfm);
                log.AppendLine($"Created usfm of {usfm}");
                usfm = UsfmToken.NormalizeUsfm(scrText.ScrStylesheet(bookNum), usfm, false,
                    scrText.RightToLeft, scrText);
                log.AppendLine($"Normalized usfm to {usfm}");

                if (chapNumToAuthorUserSFIdMap == null || chapNumToAuthorUserSFIdMap.Count == 0)
                {
                    log.AppendLine($"Using current user ({userSecret.Id}) to write book to {scrText.Name}.");
                    // If we don't have chapter authors, update book as current user
                    WriteChapterToScrText(scrText, userSecret.Id, bookNum, 0, usfm);
                }
                else
                {
                    // As we have a list of chapter authors, build a dictionary of ScrTexts for each of them
                    foreach (string userSFId in chapNumToAuthorUserSFIdMap.Values.Distinct())
                    {
                        if (userSFId != userSecret.Id)
                        {
                            // Get their user secret, so we can get their username, and create their ScrText
                            log.AppendLine($"Fetching user secret for user SF id '{userSFId}'.");
                            UserSecret authorUserSecret = await _userSecretRepository.GetAsync(userSFId);
                            log.AppendLine($"Received user secret: {(authorUserSecret == null ? "null" : (authorUserSecret.ParatextTokens == null ? "with null tokens" : "with tokens"))}");
                            log.AppendLine($"Fetching PT username from secret.");
                            string authorUserName = GetParatextUsername(authorUserSecret);
                            log.AppendLine($"Received username: {(authorUserName == null ? "null" : (authorUserName.Length == 0 ? "empty" : "non-empty"))}");
                            log.AppendLine($"Fetching scrtext using this authorUserName for PT project.");
                            ScrText item = ScrTextCollection.FindById(authorUserName, projectPTId);
                            log.AppendLine($"Received ScrText: {(item == null ? "null" : (item.Name))}");
                            scrTexts.Add(userSFId, item);
                        }
                    }

                    // If there is only one author, just write the book
                    if (scrTexts.Count == 1)
                    {
                        try
                        {
                            ScrText target = scrTexts.Values.First();
                            string authorUserSFId = scrTexts.Keys.First();
                            log.AppendLine($"Using single author (user SF id '{authorUserSFId}') to write to {target.Name} book.");
                            WriteChapterToScrText(target, authorUserSFId, bookNum, 0, usfm);
                        }
                        catch (SafetyCheckException e)
                        {
                            log.AppendLine($"There was trouble writing ({e.Message}). Trying again, but using user sf id '{userSecret.Id}' to write to {scrText.Name}");
                            // If the author does not have permission, attempt to run as the current user
                            WriteChapterToScrText(scrText, userSecret.Id, bookNum, 0, usfm);
                        }
                    }
                    else
                    {
                        log.AppendLine($"There are multiple authors. Splitting USFM into chapters.");
                        // Split the usfm into chapters
                        List<string> chapters = ScrText.SplitIntoChapters(scrText.Name, bookNum, usfm);
                        log.AppendLine($"Received chapters: {(chapters == null ? "null" : ($"count {chapters.Count}"))}");

                        // Put the individual chapters
                        foreach ((int chapterNum, string authorUserSFId) in chapNumToAuthorUserSFIdMap)
                        {
                            if ((chapterNum - 1) < chapters.Count)
                            {
                                try
                                {
                                    ScrText target = scrTexts[authorUserSFId];
                                    string payloadUsfm = chapters[chapterNum - 1];
                                    log.AppendLine($"Writing to {target.Name}, chapter {chapterNum}, using author user SF id {authorUserSFId}, the usfm: {payloadUsfm}");
                                    // The ScrText permissions will be the same as the last sync's permissions
                                    WriteChapterToScrText(target, authorUserSFId, bookNum, chapterNum,
                                        payloadUsfm);
                                }
                                catch (SafetyCheckException e)
                                {
                                    log.AppendLine($"There was trouble writing ({e.Message}). Trying again, but using user SF id '{userSecret.Id}' to write to {scrText.Name}. Also now writing the whole book, not just the single chapter.");
                                    // If the author does not have permission, attempt to run as the current user
                                    WriteChapterToScrText(scrText, userSecret.Id, bookNum, 0, usfm);
                                }
                            }
                            else
                            {
                                log.AppendLine($"Not processing erroneous chapter number '{chapterNum}'");
                            }
                        }
                    }
                }
            }
            catch (Exception e)
            {
                log.AppendLine($"An exception occurred while processing: {e}");
                string scrTextProjects = string.Join(",", scrTexts.Values.Select((ScrText scrTextItem) => scrTextItem.Name));
                log.AppendLine($"ScrTexts contained projects: {scrTextProjects}");
                string uniqueCode = $"ParatextService.PutBookText.{DateTime.UtcNow}";
                e.Data.Add(uniqueCode, log.ToString());
                throw;
            }
            finally
            {
                // Dispose the ScrText objects
                foreach (ScrText scrText in scrTexts.Values)
                {
                    scrText?.Dispose();
                }

                // Clear the collection to release the references to the ScrTexts for GC
                scrTexts.Clear();
            }
        }

        /// <summary> Get notes from the Paratext project folder. </summary>
        public string GetNotes(UserSecret userSecret, string projectId, int bookNum)
        {
            // TODO: should return some data structure instead of XML
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), projectId);
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
            var changeList = NotesFormatter.ParseNotes(notesText, new SFParatextUser(GetParatextUsername(userSecret)));
            PutCommentThreads(userSecret, projectId, changeList);
        }

        /// <summary>
        /// Returns a list of changes to apply to SF note threads to match the corresponding
        /// PT comment threads for a given book.
        /// </summary>
        public IEnumerable<NoteThreadChange> GetNoteThreadChanges(UserSecret userSecret, string projectId,
            int bookNum, IEnumerable<IDocument<NoteThread>> noteThreadDocs,
            Dictionary<int, ChapterDelta> chapterDeltas, Dictionary<string, ParatextUserProfile> ptProjectUsers)
        {
            IEnumerable<CommentThread> commentThreads = GetCommentThreads(userSecret, projectId, bookNum);
            CommentTags commentTags = GetCommentTags(userSecret, projectId);
            List<string> matchedThreadIds = new List<string>();
            List<NoteThreadChange> changes = new List<NoteThreadChange>();

            foreach (var threadDoc in noteThreadDocs)
            {
                List<string> matchedCommentIds = new List<string>();
                NoteThreadChange threadChange = new NoteThreadChange(threadDoc.Data.DataId,
                    threadDoc.Data.VerseRef.ToString(), threadDoc.Data.OriginalSelectedText,
                    threadDoc.Data.OriginalContextBefore, threadDoc.Data.OriginalContextAfter, threadDoc.Data.Status,
                    threadDoc.Data.TagIcon);
                // Find the corresponding comment thread
                var existingThread = commentThreads.SingleOrDefault(ct => ct.Id == threadDoc.Data.DataId);
                if (existingThread == null)
                {
                    // The thread has been removed
                    threadChange.ThreadRemoved = true;
                    changes.Add(threadChange);
                    continue;
                }
                matchedThreadIds.Add(existingThread.Id);
                foreach (Note note in threadDoc.Data.Notes)
                {
                    Paratext.Data.ProjectComments.Comment matchedComment =
                        GetMatchingCommentFromNote(note, existingThread, ptProjectUsers);
                    if (matchedComment != null)
                    {
                        matchedCommentIds.Add(matchedComment.Id);
                        CommentTag commentIconTag = GetCommentTag(existingThread, matchedComment, commentTags);
                        ChangeType changeType = GetCommentChangeType(matchedComment, note, commentIconTag, ptProjectUsers);
                        if (changeType != ChangeType.None)
                        {
                            threadChange.AddChange(
                                CreateNoteFromComment(note.DataId, matchedComment, commentIconTag, ptProjectUsers),
                                changeType
                            );
                        }
                    }
                    else
                        threadChange.NoteIdsRemoved.Add(note.DataId);
                }
                if (existingThread.Status.InternalValue != threadDoc.Data.Status)
                {
                    threadChange.Status = existingThread.Status.InternalValue;
                    threadChange.ThreadUpdated = true;
                }
                if (GetAssignedUserRef(existingThread.AssignedUser, ptProjectUsers) != threadDoc.Data.Assignment)
                {
                    threadChange.Assignment = GetAssignedUserRef(existingThread.AssignedUser, ptProjectUsers);
                    threadChange.ThreadUpdated = true;
                }
                CommentTag defaultThreadIconTag = GetCommentTag(existingThread, null, commentTags);
                if (defaultThreadIconTag?.Icon != threadDoc.Data.TagIcon)
                {
                    threadChange.TagIcon = defaultThreadIconTag?.Icon;
                    threadChange.ThreadUpdated = true;
                }
                // Add new Comments to note thread change
                IEnumerable<string> ptCommentIds = existingThread.Comments.Select(c => c.Id);
                IEnumerable<string> newCommentIds = ptCommentIds.Except(matchedCommentIds);
                foreach (string commentId in newCommentIds)
                {
                    Paratext.Data.ProjectComments.Comment comment =
                        existingThread.Comments.Single(c => c.Id == commentId);
                    CommentTag commentIconTag = GetCommentTag(existingThread, comment, commentTags);
                    threadChange.AddChange(CreateNoteFromComment(
                        _guidService.NewObjectId(), comment, commentIconTag, ptProjectUsers), ChangeType.Added);
                }
                if (existingThread.Comments.Count > 0)
                {
                    // Get the text anchor to use for the note
                    TextAnchor range = GetThreadTextAnchor(existingThread, chapterDeltas);
                    if (!range.Equals(threadDoc.Data.Position))
                        threadChange.Position = range;
                }
                if (threadChange.HasChange)
                    changes.Add(threadChange);
            }

            IEnumerable<string> ptThreadIds = commentThreads.Select(ct => ct.Id);
            IEnumerable<string> newThreadIds = ptThreadIds.Except(matchedThreadIds);
            foreach (string threadId in newThreadIds)
            {
                CommentThread thread = commentThreads.Single(ct => ct.Id == threadId);
                Paratext.Data.ProjectComments.Comment info = thread.Comments[0];
                CommentTag initialTag = GetCommentTag(thread, null, commentTags);
                NoteThreadChange newThread = new NoteThreadChange(threadId, info.VerseRefStr,
                    info.SelectedText, info.ContextBefore, info.ContextAfter, info.Status.InternalValue,
                    initialTag.Icon);
                newThread.Position = GetThreadTextAnchor(thread, chapterDeltas);
                newThread.Status = thread.Status.InternalValue;
                newThread.Assignment = GetAssignedUserRef(thread.AssignedUser, ptProjectUsers);
                foreach (var comm in thread.Comments)
                {
                    CommentTag commentIconTag = GetCommentTag(thread, comm, commentTags);
                    newThread.AddChange(
                        CreateNoteFromComment(_guidService.NewObjectId(), comm, commentIconTag, ptProjectUsers),
                        ChangeType.Added
                    );
                }
                changes.Add(newThread);
            }
            return changes;
        }

        public async Task UpdateParatextCommentsAsync(UserSecret userSecret, string projectId, int bookNum,
            IEnumerable<IDocument<NoteThread>> noteThreadDocs, Dictionary<string, ParatextUserProfile> ptProjectUsers)
        {
            CommentTags commentTags = GetCommentTags(userSecret, projectId);
            string username = GetParatextUsername(userSecret);
            IEnumerable<CommentThread> commentThreads =
                GetCommentThreads(userSecret, projectId, bookNum);
            List<List<Paratext.Data.ProjectComments.Comment>> noteThreadChangeList =
                await SFNotesToCommentChangeListAsync(noteThreadDocs, commentThreads, username, commentTags,
                    ptProjectUsers);

            PutCommentThreads(userSecret, projectId, noteThreadChangeList);
        }

        /// <summary>
        /// Get the most recent revision id of a commit from the last push or pull with the PT send/receive server.
        /// </summary>
        public string GetLatestSharedVersion(UserSecret userSecret, string paratextId)
        {
            if (IsResource(paratextId))
            {
                // Not meaningful for DBL resources, which do not have a local hg repo.
                return null;
            }

            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
            if (scrText != null)
            {
                return _hgHelper.GetLastPublicRevision(scrText.Directory);
            }
            else
            {
                return null;
            }
        }

        /// <summary>
        /// Checks whether a backup exists for the Paratext project repository.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="paratextId">The Paratext project identifier.</param>
        /// <returns>
        ///   <c>true</c> if the backup exists; otherwise, <c>false</c>.
        /// </returns>
        public bool BackupExists(UserSecret userSecret, string paratextId)
        {
            // We do not back up resources
            if (paratextId == null || paratextId.Length == SFInstallableDblResource.ResourceIdentifierLength)
            {
                return false;
            }

            // Get the scripture text
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);

            // If we do not have a scripture text, do not back up
            if (scrText == null)
            {
                return false;
            }

            // Use the Paratext implementation
            return this.BackupExistsInternal(scrText);
        }

        public bool BackupRepository(UserSecret userSecret, string paratextId)
        {
            // We do not back up resources
            if (paratextId == null || paratextId.Length == SFInstallableDblResource.ResourceIdentifierLength)
            {
                if (paratextId == null)
                {
                    _logger.LogInformation("Not backing up local PT repo for null paratextId.");
                }
                return false;
            }

            // Get the scripture text
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);

            // If we do not have a scripture text, do not back up
            if (scrText == null)
            {
                _logger.LogInformation($"Not backing up local PT repo since no scrText for PTId '{paratextId}'.");
                return false;
            }

            // VersionedText.BackupDirectories skips backup on error, and runs in a background thread.
            // We would rather be notified of the error, and not have this run in a background thread.
            // The following is a re-implementation of VersionedText.BackupDirectories with error trapping,
            // and file system and Mercurial dependency injection so this method can be unit tested.
            // Note that SharedProject.Repository.SendReceiveId is equivalent to ScrText.Guid - compare the
            // BackupProject and RestoreProject implementations in Paratext.Data.Repository.VersionedText.
            try
            {
                string directory = Path.Combine(Paratext.Data.ScrTextCollection.SettingsDirectory, "_Backups");
                string path = Path.Combine(directory, scrText.Guid + ".bndl");
                string tempPath = path + "_temp";
                _fileSystemService.CreateDirectory(directory);

                _hgHelper.BackupRepository(scrText.Directory, tempPath);
                if (_fileSystemService.FileExists(path))
                {
                    _fileSystemService.DeleteFile(path);
                }

                _fileSystemService.MoveFile(tempPath, path);
                return true;
            }
            catch (Exception e)
            {
                _logger.LogError(e, $"Problem backing up local PT repo for PTId '{paratextId}'.");
                // An error has occurred, so the backup was not created
                return false;
            }
        }

        public bool RestoreRepository(UserSecret userSecret, string paratextId)
        {
            // We do not back up resources
            if (paratextId == null || paratextId.Length == SFInstallableDblResource.ResourceIdentifierLength)
            {
                if (paratextId == null)
                {
                    _logger.LogInformation("Not restoring local PT repo for null paratextId.");
                }
                else if (paratextId.Length == SFInstallableDblResource.ResourceIdentifierLength)
                {
                    _logger.LogInformation("Not restoring a DBL resource.");
                }

                return false;
            }

            // Get the scripture text
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);

            // If we do not have a scripture text, do not back up
            if (scrText == null)
            {
                _logger.LogInformation($"Not restoring local PT repo since no scrText for PTId '{paratextId}'.");
                return false;
            }

            // VersionedText.RestoreProject copies files from the repository to the restored backup.
            // We would rather not do this, as there can be files trapped in the directory, particularly
            // if the incoming change included new books and the sync was cancelled. In addition,
            // Mongo is the source of truth for a project's state in Scripture Forge.
            // The following is a re-implementation of VersionedText.RestoreProject with error trapping,
            // and file system and Mercurial dependency injection so this method can be unit tested.
            if (this.BackupExistsInternal(scrText))
            {
                string source = scrText.Directory;
                string destination =
                    Path.Combine(Paratext.Data.ScrTextCollection.SettingsDirectory, "_Backups",
                        scrText.Guid.ToString());
                string restoredDestination = destination + "_Restored";
                string backupPath = destination + ".bndl";

                try
                {
                    if (_fileSystemService.DirectoryExists(restoredDestination))
                    {
                        _fileSystemService.DeleteDirectory(restoredDestination);
                    }

                    // Remove the backup destination, if it exists
                    if (_fileSystemService.DirectoryExists(destination))
                    {
                        _fileSystemService.DeleteDirectory(destination);
                    }

                    // Move the current repository to the backup destination
                    if (source != destination)
                    {
                        _fileSystemService.MoveDirectory(source, destination);
                    }

                    // Restore the Mercurial repository to a temporary destination
                    _hgHelper.RestoreRepository(restoredDestination, backupPath);

                    // Although the bundle stores phase information, this is compared against the repo the bundle is
                    // restored to. As the repo is new, the changesets from the bundle will be marked draft. Because
                    // the bundle contains changesets from the Paratext server, we can just mark the changesets public,
                    // as we do when pulling from the repo.
                    _hgHelper.MarkSharedChangeSetsPublic(restoredDestination);

                    // Now that it is ready, move it to the repository location
                    _fileSystemService.MoveDirectory(restoredDestination, source);

                    return true;
                }
                catch (Exception e)
                {
                    _logger.LogError(e, $"Problem restoring local PT repo for PTId '{paratextId}'.");
                    // On error, move the backup destination back to the repository folder
                    if (!_fileSystemService.DirectoryExists(source))
                    {
                        _fileSystemService.MoveDirectory(destination, source);
                    }
                }
            }
            else
            {
                _logger.LogInformation($"Not restoring local PT repo for PTId '{paratextId}' since no backup exists.");
            }

            // An error occurred, or the backup does not exist
            return false;
        }

        protected override void DisposeManagedResources()
        {
            _registryClient.Dispose();
            _httpClientHandler.Dispose();
        }

        /// <summary>
        /// Converts from a user role to a Paratext registry user role.
        /// </summary>
        /// <param name="role">The role.</param>
        /// <returns>
        /// The Paratext Registry user role.
        /// </returns>
        /// <remarks>
        /// Sourced from <see cref="RegistryServer" />.
        /// </remarks>
        private static string ConvertFromUserRole(UserRoles? role) => role switch
        {
            UserRoles.Administrator => SFProjectRole.Administrator,
            UserRoles.Consultant => SFProjectRole.Consultant,
            UserRoles.TeamMember => SFProjectRole.Translator,
            UserRoles.Observer => SFProjectRole.PTObserver,
            _ => string.Empty,
        };

        /// <summary>
        /// Checks whether a backup exists
        /// </summary>
        /// <param name="scrText">The scripture text.</param>
        /// <returns><c>true</c> if the backup exists; otherwise, <c>false</c>.</returns>
        /// <remarks>
        /// This is a re-implementation of <see cref="VersionedText.BackupExists(ScrText)"/>
        /// that uses file system dependency injection so this method can be unit tested.
        /// </remarks>
        private bool BackupExistsInternal(ScrText scrText)
        {
            try
            {
                string path =
                    Path.Combine(Paratext.Data.ScrTextCollection.SettingsDirectory, "_Backups", $"{scrText.Guid}.bndl");
                return _fileSystemService.FileExists(path);
            }
            catch (Exception e)
            {
                // An error occurred
                _logger.LogError(e,
                    $"Problem when checking if a local PT repo backup exists for scrText id '{scrText.Guid}'.");
                return false;
            }
        }

        private IReadOnlyList<ParatextProject> GetProjects(UserSecret userSecret,
            IEnumerable<SharedRepository> remotePtProjects, IEnumerable<ProjectMetadata> projectsMetadata)
        {
            if (userSecret == null) throw new ArgumentNullException();

            List<ParatextProject> paratextProjects = new List<ParatextProject>();
            IQueryable<SFProject> existingSfProjects = _realtimeService.QuerySnapshots<SFProject>();

            foreach (SharedRepository remotePtProject in remotePtProjects)
            {
                SFProject correspondingSfProject =
                    existingSfProjects.FirstOrDefault(sfProj => sfProj.ParatextId == remotePtProject.SendReceiveId.Id);

                bool sfProjectExists = correspondingSfProject != null;
                bool sfUserIsOnSfProject = correspondingSfProject?.UserRoles.ContainsKey(userSecret.Id) ?? false;
                bool adminOnPtProject = remotePtProject.SourceUsers.GetRole(
                    GetParatextUsername(userSecret)) == UserRoles.Administrator;
                bool ptProjectIsConnectable =
                    (sfProjectExists && !sfUserIsOnSfProject) || (!sfProjectExists && adminOnPtProject);

                // On SF Live server, many users have projects without corresponding project metadata.
                // If this happens, default to using the project's short name
                var projectMD = projectsMetadata
                    .SingleOrDefault(pmd => pmd.ProjectGuid == remotePtProject.SendReceiveId);
                string fullOrShortName = projectMD == null ? remotePtProject.ScrTextName : projectMD.FullName;

                paratextProjects.Add(new ParatextProject
                {
                    ParatextId = remotePtProject.SendReceiveId.Id,
                    Name = fullOrShortName,
                    ShortName = remotePtProject.ScrTextName,
                    LanguageTag = correspondingSfProject?.WritingSystem.Tag,
                    ProjectId = correspondingSfProject?.Id,
                    IsConnectable = ptProjectIsConnectable,
                    IsConnected = sfProjectExists && sfUserIsOnSfProject
                });
            }
            return paratextProjects.OrderBy(project => project.Name, StringComparer.InvariantCulture).ToArray();
        }

        private bool TryGetProject(UserSecret userSecret, SharedRepository sharedRepository,
            IEnumerable<ProjectMetadata> metadata, out ParatextProject ptProject)
        {
            if (sharedRepository != null)
            {
                ptProject = GetProjects(userSecret, new SharedRepository[] { sharedRepository }, metadata)
                    .FirstOrDefault();
                if (ptProject != null)
                    return true;
            }
            ptProject = null;
            return false;
        }

        /// <summary>
        /// Determines whether the specified project is registered with the Registry.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="paratextId">The paratext identifier for the project.</param>
        /// <param name="token">The cancellation token.</param>
        /// <returns>
        ///   <c>true</c> if the specified project is registered; otherwise, <c>false</c>.
        /// </returns>
        private async Task<bool> IsRegisteredAsync(UserSecret userSecret, string paratextId, CancellationToken token)
        {
            try
            {
                string registeredParatextId = await CallApiAsync(userSecret, HttpMethod.Get,
                    $"projects/{paratextId}/identification_systemId/paratext/text", null, token);
                return registeredParatextId.Trim('"') == paratextId;
            }
            catch (HttpRequestException)
            {
                // A 404 error means the project is not registered.
                return false;
            }
        }

        private void SetupMercurial()
        {
            // We do not yet know where hg will be installed on the server, so allow defining it in an env variable
            string customHgPath = Environment.GetEnvironmentVariable("HG_PATH") ?? _paratextOptions.Value.HgExe;
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                customHgPath = Path.GetExtension(customHgPath) != ".exe" ? customHgPath + ".exe" : customHgPath;
            if (!File.Exists(customHgPath))
            {
                string msg = string.Format(
                    "Error: Could not find hg executable at {0}. Please install hg 4.7 or greater.", customHgPath);
                _logger.LogError(msg);
                throw new InvalidOperationException(msg);
            }
            var hgMerge = Path.Combine(AssemblyDirectory, "ParatextMerge.py");
            _hgHelper.SetDefault(new Hg(customHgPath, hgMerge, AssemblyDirectory));
        }

        /// <summary> Copy resource files from the Assembly Directory into the sync directory. </summary>
        private void InstallStyles()
        {
            string[] resources = new[] { "usfm.sty", "revisionStyle.sty", "revisionTemplate.tem", "usfm_mod.sty" };
            foreach (string resource in resources)
            {
                string target = Path.Combine(SyncDir, resource);
                string source = Path.Combine(AssemblyDirectory, resource);
                if (!File.Exists(target))
                {
                    _logger.LogInformation($"Installing missing {target}");
                    File.Copy(source, target, true);
                }
            }
        }

        /// <summary>
        /// Ensure the target project repository exists on the local SF server, cloning if necessary.
        /// </summary>
        private void EnsureProjectReposExists(UserSecret userSecret, ParatextProject target,
            IInternetSharedRepositorySource repositorySource)
        {
            string username = GetParatextUsername(userSecret);
            using ScrText scrText = ScrTextCollection.FindById(username, target.ParatextId);
            bool targetNeedsCloned = scrText == null;
            if (target is ParatextResource resource)
            {
                // If the target is a resource, install it
                InstallResource(resource, target.ParatextId, targetNeedsCloned);
            }
            else if (targetNeedsCloned)
            {
                SharedRepository targetRepo = new SharedRepository(target.ShortName, HexId.FromStr(target.ParatextId),
                    RepositoryType.Shared);
                CloneProjectRepo(repositorySource, target.ParatextId, targetRepo);
            }
        }

        /// <summary>
        /// Installs the resource.
        /// </summary>
        /// <param name="resource">The resource.</param>
        /// <param name="targetParatextId">The target paratext identifier.</param>
        /// <param name="needsToBeCloned">If set to <c>true</c>, the resource needs to be cloned.</param>
        /// <remarks>
        ///   <paramref name="targetParatextId" /> is required because the resource may be a source or target.
        /// </remarks>
        private void InstallResource(ParatextResource resource, string targetParatextId, bool needsToBeCloned)
        {
            if (resource.InstallableResource != null)
            {
                // Install the resource if it is missing or out of date
                if (!resource.IsInstalled
                    || resource.AvailableRevision > resource.InstalledRevision
                    || resource.InstallableResource.IsNewerThanCurrentlyInstalled())
                {
                    resource.InstallableResource.Install();
                    needsToBeCloned = true;
                }

                // Extract the resource to the source directory
                if (needsToBeCloned)
                {
                    string path = Path.Combine(SyncDir, targetParatextId, "target");
                    _fileSystemService.CreateDirectory(path);
                    resource.InstallableResource.ExtractToDirectory(path);
                }
            }
            else
            {
                _logger.LogWarning($"The installable resource is not available for {resource.ParatextId}");
            }
        }

        /// <summary> Create a shared project object for a given project. </summary>
        private SharedProject CreateSharedProject(UserSecret userSecret, string paratextId, string proj,
            SharedRepositorySource source, SharedRepository sharedRepository)
        {
            string username = GetParatextUsername(userSecret);
            // Specifically set the ScrText property of the SharedProject to indicate the project is available locally
            using ScrText scrText = ScrTextCollection.FindById(username, paratextId);
            if (scrText == null)
                throw new Exception(
                    $"Failed to fetch ScrText for PT project id {paratextId} using PT username {username}");

            // Previously we used the CreateSharedProject method of SharingLogic but it would
            // result in null if the user did not have a license to the repo which happens
            // if the project is derived from another. This ensures the SharedProject is available
            return new SharedProject
            {
                ScrTextName = proj,
                Repository = sharedRepository,
                SendReceiveId = HexId.FromStr(paratextId),
                ScrText = scrText,
                Permissions = scrText.Permissions
            };
        }

        private void CloneProjectRepo(IInternetSharedRepositorySource source, string projectId, SharedRepository repo)
        {
            string clonePath = Path.Combine(SyncDir, projectId, "target");
            if (!_fileSystemService.DirectoryExists(clonePath))
            {
                _fileSystemService.CreateDirectory(clonePath);
                _hgHelper.Init(clonePath);
            }
            source.Pull(clonePath, repo);
            _hgHelper.Update(clonePath);
        }

        private IEnumerable<CommentThread> GetCommentThreads(UserSecret userSecret, string projectId, int bookNum)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), projectId);
            if (scrText == null)
                return null;

            CommentManager manager = CommentManager.Get(scrText);
            manager.LoadIfChanged();
            IEnumerable<CommentThread> threads = manager.FindThreads((commentThread) =>
                { return commentThread.VerseRef.BookNum == bookNum; }, false);
            return threads.Where(t => !t.Id.StartsWith("ANSWER_"));
        }


        private void PutCommentThreads(UserSecret userSecret, string projectId,
            List<List<Paratext.Data.ProjectComments.Comment>> changeList)
        {
            string username = GetParatextUsername(userSecret);
            List<string> users = new List<string>();
            int nbrAddedComments = 0, nbrDeletedComments = 0, nbrUpdatedComments = 0;
            ScrText scrText = ScrTextCollection.FindById(username, projectId);
            if (scrText == null)
                throw new DataNotFoundException("Can't get access to cloned project.");
            CommentManager manager = CommentManager.Get(scrText);

            // Algorithm sourced from Paratext DataAccessServer
            foreach (List<Paratext.Data.ProjectComments.Comment> thread in changeList)
            {
                CommentThread existingThread = manager.FindThread(thread[0].Thread);
                foreach (Paratext.Data.ProjectComments.Comment comment in thread)
                {
                    Paratext.Data.ProjectComments.Comment existingComment =
                        existingThread?.Comments.FirstOrDefault(c => c.Id == comment.Id);
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
                _paratextDataHelper.CommitVersionedText(scrText, $"{nbrAddedComments} notes added and "
                    + $"{nbrDeletedComments + nbrUpdatedComments} notes updated or deleted in synchronize");
                _logger.LogInformation("{0} added {1} notes, updated {2} notes and deleted {3} notes", userSecret.Id,
                    nbrAddedComments, nbrUpdatedComments, nbrDeletedComments);
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Exception while updating notes: {0}", e.Message);
            }
        }

        private CommentTags GetCommentTags(UserSecret userSecret, string projectId)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), projectId);
            return scrText == null ? null : CommentTags.Get(scrText);
        }

        private async Task<string> CallApiAsync(UserSecret userSecret, HttpMethod method,
            string url, string content = null, CancellationToken token = default)
        {
            using (ParatextAccessLock accessLock = await GetParatextAccessLock(userSecret.Id, token))
            using (var request = new HttpRequestMessage(method, $"api8/{url}"))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer",
                    accessLock.UserSecret.ParatextTokens.AccessToken);
                if (content != null)
                {
                    request.Content = new StringContent(content);
                }
                HttpResponseMessage response = await _registryClient.SendAsync(request, token);
                if (response.IsSuccessStatusCode)
                {
                    return await response.Content.ReadAsStringAsync();
                }
                else
                {
                    throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
                }
            }
        }

        /// <summary>
        /// Get access to a source for PT project repositories, based on user secret.
        /// </summary>
        private async Task<IInternetSharedRepositorySource> GetInternetSharedRepositorySource(string userId,
            CancellationToken token)
        {
            using (ParatextAccessLock accessLock = await GetParatextAccessLock(userId, token))
            {
                return _internetSharedRepositorySourceProvider.GetSource(accessLock.UserSecret,
                        _sendReceiveServerUri, _registryServerUri);
            }
        }

        /// <summary>
        /// Get Paratext resources that a user has access to.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="includeInstallableResource">If set to <c>true</c> include the installable resource.</param>
        /// <returns>
        /// The available resources.
        /// </returns>
        private async Task<IReadOnlyList<ParatextResource>> GetResourcesInternalAsync(string userId,
            bool includeInstallableResource, CancellationToken token)
        {
            IEnumerable<SFInstallableDblResource> resources;
            using (ParatextAccessLock accessLock = await GetParatextAccessLock(userId, token))
            {
                resources = SFInstallableDblResource.GetInstallableDblResources(
                    accessLock.UserSecret,
                    this._paratextOptions.Value,
                    this._restClientFactory,
                    this._fileSystemService,
                    this._jwtTokenHelper,
                    _exceptionHandler,
                    this._dblServerUri);
            }
            IReadOnlyDictionary<string, int> resourceRevisions =
                SFInstallableDblResource.GetInstalledResourceRevisions();
            return resources.OrderBy(r => r.FullName).Select(r => new ParatextResource
            {
                AvailableRevision = r.DBLRevision,
                InstallableResource = includeInstallableResource ? r : null,
                InstalledRevision = resourceRevisions
                    .ContainsKey(r.DBLEntryUid.Id) ? resourceRevisions[r.DBLEntryUid.Id] : 0,
                IsConnectable = false,
                IsConnected = false,
                IsInstalled = resourceRevisions.ContainsKey(r.DBLEntryUid.Id),
                LanguageTag = r.LanguageID.Code,
                Name = r.FullName,
                ParatextId = r.DBLEntryUid.Id,
                ProjectId = null,
                ShortName = r.Name,
            }).ToArray();
        }

        /// <summary> Get the corresponding Comment from a note. </summary>
        private Paratext.Data.ProjectComments.Comment GetMatchingCommentFromNote(Note note, CommentThread thread,
            Dictionary<string, ParatextUserProfile> ptProjectUsers)
        {
            ParatextUserProfile ptUser = note.SyncUserRef == null
                ? null
                : ptProjectUsers.Values.SingleOrDefault(u => u.OpaqueUserId == note.SyncUserRef);
            if (ptUser == null)
                return null;
            string date = new DateTimeOffset(note.DateCreated).ToString("o");
            // Comment ids are generated using the Paratext username. Since we do not want to transparently
            // store a username to a note in SF we construct the intended Comment id at runtime.
            string commentId = string.Format("{0}/{1}/{2}", note.ThreadId, ptUser.Username, date);
            Paratext.Data.ProjectComments.Comment matchingComment =
                thread.Comments.LastOrDefault(c => c.Id == commentId);
            if (matchingComment != null)
                return matchingComment;

            // Try another method to find the comment
            DateTime noteTime = note.DateCreated.ToUniversalTime();
            return thread.Comments
                .Where(c => DateTime.Equals(noteTime, DateTime.Parse(c.Date, null, DateTimeStyles.AdjustToUniversal)))
                .LastOrDefault(c => c.User == ptUser.Username);
        }

        /// <summary>
        /// Get the comment change lists from the up-to-date note thread docs in the Scripture Forge mongo database.
        /// </summary>
        private async Task<List<List<Paratext.Data.ProjectComments.Comment>>> SFNotesToCommentChangeListAsync(
            IEnumerable<IDocument<NoteThread>> noteThreadDocs, IEnumerable<CommentThread> commentThreads,
            string defaultUsername, CommentTags commentTags, Dictionary<string, ParatextUserProfile> ptProjectUsers)
        {
            List<List<Paratext.Data.ProjectComments.Comment>> changes =
                new List<List<Paratext.Data.ProjectComments.Comment>>();
            IEnumerable<IDocument<NoteThread>> activeThreadDocs = noteThreadDocs.Where(t => t.Data != null);
            foreach (IDocument<NoteThread> threadDoc in activeThreadDocs)
            {
                List<Paratext.Data.ProjectComments.Comment> thread = new List<Paratext.Data.ProjectComments.Comment>();
                CommentThread existingThread = commentThreads.SingleOrDefault(ct => ct.Id == threadDoc.Data.DataId);
                List<(int, string)> threadNoteParatextUserRefs = new List<(int, string)>();
                for (int i = 0; i < threadDoc.Data.Notes.Count; i++)
                {
                    Note note = threadDoc.Data.Notes[i];
                    Paratext.Data.ProjectComments.Comment matchedComment = existingThread == null
                        ? null
                        : GetMatchingCommentFromNote(note, existingThread, ptProjectUsers);
                    if (matchedComment != null)
                    {
                        var comment = (Paratext.Data.ProjectComments.Comment)matchedComment.Clone();
                        bool commentUpdated = false;
                        if (note.Content != comment.Contents?.InnerXml)
                        {
                            if (comment.Contents == null)
                                comment.AddTextToContent("", false);
                            comment.Contents.InnerXml = note.Content;
                            commentUpdated = true;
                        }
                        if (note.Deleted && !comment.Deleted)
                        {
                            comment.Deleted = true;
                            commentUpdated = true;
                        }
                        if (commentUpdated)
                        {
                            thread.Add(comment);
                        }
                    }
                    else
                    {
                        // new comment added
                        ParatextUserProfile ptProjectUser;
                        UserSecret userSecret = _userSecretRepository.Query().FirstOrDefault(s => s.Id == note.OwnerRef);
                        if (userSecret == null)
                            ptProjectUser = FindOrCreateParatextUser(defaultUsername, ptProjectUsers);
                        else
                            ptProjectUser = FindOrCreateParatextUser(GetParatextUsername(userSecret), ptProjectUsers);

                        SFParatextUser ptUser = new SFParatextUser(ptProjectUser.Username);
                        var comment = new Paratext.Data.ProjectComments.Comment(ptUser)
                        {
                            VerseRefStr = threadDoc.Data.VerseRef.ToString(),
                            SelectedText = threadDoc.Data.OriginalSelectedText,
                            ContextBefore = threadDoc.Data.OriginalContextBefore,
                            ContextAfter = threadDoc.Data.OriginalContextAfter
                        };
                        PopulateCommentFromNote(note, comment, commentTags);
                        thread.Add(comment);
                        if (note.SyncUserRef == null)
                        {
                            threadNoteParatextUserRefs.Add((i, ptProjectUser.OpaqueUserId));
                        }
                    }
                }
                if (thread.Count() > 0)
                {
                    changes.Add(thread);
                    // Set the sync user ref on the notes in the SF Mongo DB
                    await UpdateNoteSyncUserAsync(threadDoc, threadNoteParatextUserRefs);
                }
            }
            return changes;
        }

        private ChangeType GetCommentChangeType(Paratext.Data.ProjectComments.Comment comment, Note note,
            CommentTag commentTag, Dictionary<string, ParatextUserProfile> ptProjectUsers)
        {
            if (comment.Deleted != note.Deleted)
                return ChangeType.Deleted;
            // Check if fields have been updated in Paratext
            bool statusChanged = comment.Status.InternalValue != note.Status;
            bool typeChanged = comment.Type.InternalValue != note.Type;
            bool conflictTypeChanged = comment.ConflictType.InternalValue != note.ConflictType;
            bool acceptedChangeXmlChanged = comment.AcceptedChangeXmlStr != note.AcceptedChangeXml;
            bool contentChanged = comment.Contents?.InnerXml != note.Content;
            bool tagChanged = commentTag?.Icon != note.TagIcon;
            bool assignedUserChanged = GetAssignedUserRef(comment.AssignedUser, ptProjectUsers) != note.Assignment;
            if (contentChanged ||
                statusChanged ||
                tagChanged ||
                typeChanged ||
                conflictTypeChanged ||
                assignedUserChanged ||
                acceptedChangeXmlChanged)
                return ChangeType.Updated;
            return ChangeType.None;
        }

        private void PopulateCommentFromNote(Note note, Paratext.Data.ProjectComments.Comment comment,
            CommentTags commentTags)
        {

            comment.Thread = note.ThreadId;
            comment.Date = new DateTimeOffset(note.DateCreated).ToString("o");
            comment.Deleted = note.Deleted;

            if (!string.IsNullOrEmpty(note.Content))
                comment.GetOrCreateCommentNode().InnerXml = note.Content;
            if (_userSecretRepository.Query().Any(u => u.Id == note.OwnerRef))
                comment.ExternalUser = note.OwnerRef;
            if (note.TagIcon != null)
            {
                var commentTag = new CommentTag(null, note.TagIcon);
                comment.TagsAdded = new[] { commentTags.FindMatchingTag(commentTag).ToString() };
            }
        }

        private Note CreateNoteFromComment(string noteId, Paratext.Data.ProjectComments.Comment comment,
            CommentTag commentTag, Dictionary<string, ParatextUserProfile> ptProjectUsers)
        {
            return new Note
            {
                DataId = noteId,
                ThreadId = comment.Thread,
                Type = comment.Type.InternalValue,
                ConflictType = comment.ConflictType.InternalValue,
                ExtUserId = comment.ExternalUser,
                // The owner is unknown at this point and is determined when submitting the ops to the note thread docs
                OwnerRef = "",
                SyncUserRef = FindOrCreateParatextUser(comment.User, ptProjectUsers)?.OpaqueUserId,
                Content = comment.Contents?.InnerXml,
                AcceptedChangeXml = comment.AcceptedChangeXmlStr,
                DateCreated = DateTime.Parse(comment.Date),
                DateModified = DateTime.Parse(comment.Date),
                Deleted = comment.Deleted,
                Status = comment.Status.InternalValue,
                TagIcon = commentTag?.Icon,
                Reattached = comment.Reattached,
                Assignment = GetAssignedUserRef(comment.AssignedUser, ptProjectUsers)
            };
        }

        private string GetAssignedUserRef(string assignedPTUser, Dictionary<string, ParatextUserProfile> ptProjectUsers)
        {
            switch (assignedPTUser)
            {
                case Paratext.Data.ProjectComments.CommentThread.teamUser:
                case Paratext.Data.ProjectComments.CommentThread.unassignedUser:
                case null:
                    return assignedPTUser;
            }
            return FindOrCreateParatextUser(assignedPTUser, ptProjectUsers).OpaqueUserId;
        }

        private CommentTag GetCommentTag(Paratext.Data.ProjectComments.CommentThread thread,
            Paratext.Data.ProjectComments.Comment comment, CommentTags commentTags)
        {
            // Use the main to do tag as default
            CommentTag tagInUse = commentTags.Get(CommentTag.toDoTagId);
            CommentTag lastTodoTagUsed = null;
            foreach (Paratext.Data.ProjectComments.Comment threadComment in thread.Comments)
            {
                bool tagAddedInUse = threadComment.TagsAdded != null && threadComment.TagsAdded.Length > 0;
                if (tagAddedInUse)
                {
                    tagInUse = commentTags.Get(int.Parse(threadComment.TagsAdded[0]));
                }

                // When checking the tag for the thread and a conflict is found then use that
                if (comment == null)
                {
                    if (threadComment.Type == NoteType.Conflict)
                        return CommentTag.ConflictTag;
                    continue;
                }

                if (threadComment.Id == comment.Id)
                {
                    // Overwrite any tag with a conflict if needed
                    if (comment.Type == NoteType.Conflict)
                        return CommentTag.ConflictTag;

                    // Ignore any repeat tag icons i.e. only use a tag if it has changed
                    if (lastTodoTagUsed != null && lastTodoTagUsed.Icon == tagInUse.Icon && (comment.Status == NoteStatus.Todo || tagAddedInUse))
                        return null;

                    // Only need to use the tag when there is a status in use or a tag has been specified
                    if (comment.Status != NoteStatus.Unspecified || tagAddedInUse)
                        return tagInUse;

                    return null;
                }
                // Keep track of the last used to do status so we can avoid any repeats
                if (threadComment.Status == NoteStatus.Todo)
                    lastTodoTagUsed = tagInUse;
                else if (threadComment.Status == NoteStatus.Resolved || threadComment.Status == NoteStatus.Done)
                    lastTodoTagUsed = null;
            }
            // If we reach this far then the request is for the last used tag which is applied to the thread
            return tagInUse;
        }

        private string GetVerseText(Delta delta, VerseRef verseRef)
        {
            string vref = string.IsNullOrEmpty(verseRef.Verse) ? verseRef.VerseNum.ToString() : verseRef.Verse;
            return delta.TryConcatenateInserts(out string verseText, vref) ? verseText : string.Empty;
        }

        private TextAnchor GetThreadTextAnchor(CommentThread thread, Dictionary<int, ChapterDelta> chapterDeltas)
        {
            Paratext.Data.ProjectComments.Comment comment =
                thread.Comments.LastOrDefault(c => c.Reattached != null) ?? thread.Comments[0];
            VerseRef verseRef = comment.VerseRef;
            int startPos = comment.StartPosition;
            string selectedText = comment.SelectedText;
            string contextBefore = comment.ContextBefore;
            string contextAfter = comment.ContextAfter;
            if (comment.Reattached != null)
            {
                string[] reattachedParts = comment.Reattached.Split(PtxUtils.StringUtils.orcCharacter);
                verseRef = new VerseRef(reattachedParts[0]);
                selectedText = reattachedParts[1];
                startPos = int.Parse(reattachedParts[2]);
                contextBefore = reattachedParts[3];
                contextAfter = reattachedParts[4];
            }

            if (!chapterDeltas.TryGetValue(verseRef.ChapterNum, out ChapterDelta chapterDelta) || startPos == 0)
                return new TextAnchor();

            string verseText = GetVerseText(chapterDelta.Delta, verseRef);
            verseText = verseText.Replace("\n", "\0");
            PtxUtils.StringUtils.MatchContexts(verseText, contextBefore, selectedText, contextAfter, null, ref startPos,
                out int posJustPastLastCharacter);
            // The text anchor is relative to the text in the verse
            return new TextAnchor { Start = startPos, Length = posJustPastLastCharacter - startPos };
        }

        private ParatextUserProfile FindOrCreateParatextUser(string paratextUsername,
            Dictionary<string, ParatextUserProfile> ptProjectUsers)
        {
            if (string.IsNullOrEmpty(paratextUsername))
                return null;
            if (!ptProjectUsers.TryGetValue(paratextUsername, out ParatextUserProfile ptProjectUser))
            {
                ptProjectUser = new ParatextUserProfile
                {
                    OpaqueUserId = _guidService.NewObjectId(),
                    Username = paratextUsername
                };
                ptProjectUsers.Add(paratextUsername, ptProjectUser);
            }
            return ptProjectUser;
        }

        private async Task UpdateNoteSyncUserAsync(IDocument<NoteThread> noteThreadDoc,
            List<(int, string)> paratextUserByNoteIndex)
        {
            await noteThreadDoc.SubmitJson0OpAsync(op =>
            {
                foreach ((int index, string syncuser) in paratextUserByNoteIndex)
                    op.Set(t => t.Notes[index].SyncUserRef, syncuser);
            });
        }

        // Make sure there are no asynchronous methods called after this until the progress is completed.
        private void StartProgressReporting(IProgress<ProgressState> progress)
        {
            if (progress == null)
                return;
            var progressDisplay = new SyncProgressDisplay(progress);
            PtxUtils.Progress.Progress.Mgr.SetDisplay(progressDisplay);
        }

        private async Task<ParatextAccessLock> GetParatextAccessLock(string userId, CancellationToken token)
        {
            SemaphoreSlim semaphore = _tokenRefreshSemaphores.GetOrAdd(userId, (string key) => new SemaphoreSlim(1, 1));
            await semaphore.WaitAsync();

            try
            {
                Attempt<UserSecret> attempt = await _userSecretRepository.TryGetAsync(userId);
                if (!attempt.TryResult(out UserSecret userSecret))
                {
                    throw new DataNotFoundException("Could not find user secrets for " + userId);
                }

                if (!userSecret.ParatextTokens.ValidateLifetime())
                {
                    Tokens refreshedUserTokens =
                        await _jwtTokenHelper.RefreshAccessTokenAsync(_paratextOptions.Value, userSecret.ParatextTokens,
                            _registryClient, token);
                    userSecret = await _userSecretRepository
                        .UpdateAsync(userId, b => b.Set(u => u.ParatextTokens, refreshedUserTokens));
                }
                return new ParatextAccessLock(semaphore, userSecret);
            }
            catch
            {
                // If an exception is thrown between awaiting the semaphore and returning the ParatextAccessLock, the
                // caller of the method will not get a reference to a ParatextAccessLock and can't release
                // the semaphore.
                semaphore.Release();
                throw;
            }
        }

        /// <summary>
        /// Writes the chapter to the <see cref="ScrText" />.
        /// </summary>
        /// <param name="scrText">The Scripture Text from Paratext.</param>
        /// <param name="authorId">The user identifier for the author.</param>
        /// <param name="bookNum">The book number.</param>
        /// <param name="chapterNum">The chapter number. Set to 0 to write the entire book.</param>
        /// <param name="usfm">The USFM to write.</param>
        private void WriteChapterToScrText(ScrText scrText, string userId, int bookNum, int chapterNum, string usfm)
        {
            // If we don't have chapter authors, update book as current user
            if (scrText.Permissions.AmAdministrator)
            {
                // if the current user is an administrator, then always allow editing the book text even if the user
                // doesn't have permission. This will ensure that a sync by an administrator never fails.
                scrText.Permissions.RunWithEditPermision(bookNum,
                    () => scrText.PutText(bookNum, chapterNum, false, usfm, null));
            }
            else
            {
                scrText.PutText(bookNum, chapterNum, false, usfm, null);
            }

            if (chapterNum == 0)
            {
                _logger.LogInformation("{0} updated {1} in {2}.", userId,
                    Canon.BookNumberToEnglishName(bookNum), scrText.Name);
            }
            else
            {
                _logger.LogInformation("{0} updated chapter {1} of {2} in {3}.", userId,
                    chapterNum, Canon.BookNumberToEnglishName(bookNum), scrText.Name);
            }
        }
    }

    class ParatextAccessLock : DisposableBase
    {
        private SemaphoreSlim _userSemaphore;
        public readonly UserSecret UserSecret;

        public ParatextAccessLock(SemaphoreSlim userSemaphore, UserSecret userSecret)
        {
            _userSemaphore = userSemaphore;
            UserSecret = userSecret;
        }

        protected override void DisposeManagedResources()
        {
            _userSemaphore.Release();
        }
    }
}
