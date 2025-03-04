using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
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
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Terms;
using Paratext.Data.Users;
using PtxUtils;
using SIL.Converters.Usj;
using SIL.ObjectModel;
using SIL.Scripture;
using SIL.WritingSystems;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides interaction with Paratext libraries for data processing and exchanging data with Paratext servers.
/// Also contains methods for interacting with the Paratext Registry web service API.
/// </summary>
public class ParatextService : DisposableBase, IParatextService
{
    internal HttpClient _registryClient;
    private readonly IOptions<ParatextOptions> _paratextOptions;
    private readonly IRepository<UserSecret> _userSecretRepository;
    private readonly IRealtimeService _realtimeService;
    private readonly IOptions<SiteOptions> _siteOptions;
    private readonly IFileSystemService _fileSystemService;
    private readonly HttpClientHandler _httpClientHandler;
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
    private readonly DotNetCoreAlert _alertSystem;
    private readonly IDeltaUsxMapper _deltaUsxMapper;
    private readonly IAuthService _authService;
    private readonly Dictionary<string, string> _forcedUsernames = [];

    public ParatextService(
        IWebHostEnvironment env,
        IOptions<ParatextOptions> paratextOptions,
        IRepository<UserSecret> userSecretRepository,
        IRealtimeService realtimeService,
        IExceptionHandler exceptionHandler,
        IOptions<SiteOptions> siteOptions,
        IFileSystemService fileSystemService,
        ILogger<ParatextService> logger,
        IJwtTokenHelper jwtTokenHelper,
        IParatextDataHelper paratextDataHelper,
        IInternetSharedRepositorySourceProvider internetSharedRepositorySourceProvider,
        IGuidService guidService,
        ISFRestClientFactory restClientFactory,
        IHgWrapper hgWrapper,
        IDeltaUsxMapper deltaUsxMapper,
        IAuthService authService
    )
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
        _alertSystem = new DotNetCoreAlert(_logger);
        _deltaUsxMapper = deltaUsxMapper;
        _authService = authService;

        _httpClientHandler = new HttpClientHandler();
        _registryClient = new HttpClient(_httpClientHandler);
        if (env.IsDevelopment() || env.IsEnvironment("Testing"))
        {
            _httpClientHandler.ServerCertificateCustomValidationCallback =
                HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
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
            string location = Assembly.GetExecutingAssembly().Location;
            return Path.GetDirectoryName(location);
        }
    }

    /// <summary> Path to cloned PT project Mercurial repos. </summary>
    public string SyncDir { get; set; }

    internal IScrTextCollection ScrTextCollection { get; set; }
    internal ISharingLogicWrapper SharingLogicWrapper { get; set; }

    /// <summary> Prepare access to Paratext.Data library, authenticate, and prepare Mercurial. </summary>
    public void Init()
    {
        System.Diagnostics.Trace.AutoFlush = true;
        // Uncomment to output more info to the Terminal from ParatextData.dll for investigating.
        // The output is using System.Diagnostics.Trace and so is not managed by the ILogging LogLevel filtering
        // settings.
        // System.Diagnostics.Trace.Listeners.Add(new System.Diagnostics.TextWriterTraceListener(Console.Out));

        // Stop ParatextData.dll Trace output from appearing on the server.
        System.Diagnostics.Trace.Listeners.Clear();

        SyncDir = Path.Combine(_siteOptions.Value.SiteDir, "sync");
        if (!_fileSystemService.DirectoryExists(SyncDir))
            _fileSystemService.CreateDirectory(SyncDir);
        // Disable caching VersionedText instances since multiple repos may exist on SF server with the same GUID
        Environment.SetEnvironmentVariable("PTD_CACHE_VERSIONED_TEXT", "DISABLED");
        RegistryU.Implementation = new DotNetCoreRegistry();
        Alert.Implementation = _alertSystem;
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
    /// <returns>The project that was synced. This is returned so we can use it for other Paratext logic.</returns>
    public async Task<ParatextProject> SendReceiveAsync(
        UserSecret userSecret,
        string paratextId,
        IProgress<ProgressState>? progress,
        CancellationToken token,
        SyncMetrics syncMetrics
    )
    {
        if (userSecret == null || paratextId == null)
        {
            throw new ArgumentNullException();
        }

        void traceListener(string message) => syncMetrics.Log.Add($"{DateTime.UtcNow:u} Trace: {message}");
        void alertListener(string message) => syncMetrics.Log.Add($"{DateTime.UtcNow:u} {message}");
        LambdaTraceListener listener = new LambdaTraceListener(traceListener);
        try
        {
            // Messages from ParatextData Hg.cs and SharingLogic HandleErrors() go to Trace and Alert. Record them into
            // each sync's SyncMetrics log. This will also unfortunately capture trace and alert messages from other
            // irrelevant areas or project syncs that happen at the same time, along with the desired information. These
            // internal messages, including messages from unrelated projects, are not necessarily for displaying to a
            // user in error reports.
            System.Diagnostics.Trace.Listeners.Add(listener);
            _alertSystem.AddListener(alertListener);

            IInternetSharedRepositorySource source = await GetInternetSharedRepositorySource(userSecret.Id, token);

            // See if we can retrieve the project metadata and repository directly via the Paratext id
            ProjectMetadata? projectMetadata = source.GetProjectMetadata(paratextId);
            SharedRepository? sendReceiveRepository = null;
            IEnumerable<ProjectMetadata> projectsMetadata = [];
            IEnumerable<string> projectGuids = [];
            if (projectMetadata is not null)
            {
                // Get the project license, so we can get the repositories for it
                ProjectLicense? projectLicense = source.GetLicenseForUserProject(paratextId);
                if (projectLicense is not null)
                {
                    // Get the repository for the project
                    IEnumerable<SharedRepository> repositories = source.GetRepositories([projectLicense]);
                    sendReceiveRepository = repositories.FirstOrDefault(r => r.SendReceiveId.Id == paratextId);

                    // Set up the projects metadata
                    projectsMetadata = [projectMetadata];
                    projectGuids = [projectMetadata.ProjectGuid.Id];
                }
            }

            // If we could not get the send/receive repository, this project shares a registration with another project
            if (sendReceiveRepository is null)
            {
                IEnumerable<SharedRepository> repositories = GetRepositories(
                    source,
                    $"For SF user id {userSecret.Id}, while attempting to sync PT project id {paratextId}."
                );
                projectsMetadata = source.GetProjectsMetaData();
                projectGuids = projectsMetadata.Select(pmd => pmd.ProjectGuid.Id);
                sendReceiveRepository = repositories.FirstOrDefault(r => r.SendReceiveId.Id == paratextId);
            }

            if (TryGetProject(userSecret, sendReceiveRepository, projectsMetadata, out ParatextProject ptProject))
            {
                if (!projectGuids.Contains(paratextId))
                    _logger.LogWarning($"The project with PT ID {paratextId} did not have a full name available.");
            }
            else
            {
                // See if this is a resource
                IReadOnlyList<ParatextResource> resources = await GetResourcesInternalAsync(userSecret.Id, true, token);
                ptProject = resources.SingleOrDefault(r => r.ParatextId == paratextId);
            }

            if (ptProject == null)
            {
                throw new ArgumentException(
                    "PT projects with the following PT ids were requested but without access or they don't exist: "
                        + $"{paratextId}"
                );
            }
            EnsureProjectReposExists(userSecret, ptProject, source);
            if (ptProject is not ParatextResource)
            {
                StartProgressReporting(progress);

                string username = GetParatextUsername(userSecret);
                using ScrText scrText =
                    ScrTextCollection.FindById(username, paratextId)
                    ?? throw new Exception(
                        $"Failed to fetch ScrText for PT project id {paratextId} using PT username {username}"
                    );
                SharedProject sharedProj = CreateSharedProject(
                    paratextId,
                    ptProject.ShortName,
                    scrText,
                    sendReceiveRepository
                );

                // If the current user is not in the shared project's permissions, use the Registry's permissions
                ProjectUser? user = sharedProj.Permissions.GetUser();
                if (user is null || user.Role == UserRoles.None)
                {
                    // As we expect the permission manager to come from the Registry, the default username will be from
                    // the Paratext license for this machine, or incorrect if Paratext is installed. That will cause the
                    // DefaultUser to be invalid if Paratext is not installed. To resolve this, we have a wrapper
                    // implementation of PermissionManager that allows us to define the default username.
                    PermissionManager permissionManager = SharingLogicWrapper.SearchForBestProjectUsersData(
                        source.AsInternetSharedRepositorySource(),
                        sharedProj
                    );
                    sharedProj.Permissions = new ParatextRegistryPermissionManager(username, permissionManager);
                }

                List<SharedProject> sharedPtProjectsToSr = [sharedProj];

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
                bool noErrors = SharingLogicWrapper.HandleErrors(
                    () =>
                        success = SharingLogicWrapper.ShareChanges(
                            sharedPtProjectsToSr,
                            source.AsInternetSharedRepositorySource(),
                            out results,
                            sharedPtProjectsToSr
                        )
                );
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
                if (
                    !noErrors
                    || !success
                    || results is null
                    || results.Any(r => r == null)
                    || results.Any(r => r.Result != SendReceiveResultEnum.Succeeded)
                )
                {
                    string resultsInfo = ExplainSRResults(results);
                    throw new InvalidOperationException(
                        $"Failed: Errors occurred while performing the sync with the Paratext Server. More information: noErrors: {noErrors}. success: {success}. null results: {results == null}. results: {resultsInfo}"
                    );
                }

                // Update the cached comment manager
                CommentManager manager = CommentManager.Get(scrText);
                manager.Load();
            }

            return ptProject;
        }
        finally
        {
            _alertSystem.RemoveListener(alertListener);
            System.Diagnostics.Trace.Listeners.Remove(listener);
        }
    }

    /// <returns>
    /// True if the user secret is able to access the PT Registry. PT Registry is a web service such as at
    /// registry.paratext.org.
    /// False if there is a problem with authorization or connecting to the PT Registry.
    /// </returns>
    public async Task<bool> CanUserAuthenticateToPTRegistryAsync(UserSecret? userSecret)
    {
        if (userSecret == null)
        {
            throw new ArgumentNullException(nameof(userSecret));
        }
        if (userSecret.Id == null || userSecret.ParatextTokens == null)
        {
            throw new ArgumentException(nameof(userSecret));
        }
        try
        {
            await CallApiAsync(userSecret, HttpMethod.Get, "userinfo", content: null);
            // If the server responds with code 200, then the user is authorized.
            // They might not have a completed registration. And they might not be
            // an "approved translator". But they are able to authorize to PT
            // Registry.
            return true;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    /// <returns>
    /// True if the user secret is able to access the PT Archives. PT Archives is a service such as at
    /// archives.paratext.org, which provides Mercurial project repositores, and may sometimes be referred to as
    /// "the Send and Receive server".
    /// False if there is a problem with authorization or connecting to the PT Archives.
    /// </returns>
    public async Task<bool> CanUserAuthenticateToPTArchivesAsync(string sfUserId)
    {
        if (string.IsNullOrWhiteSpace(sfUserId))
        {
            throw new ArgumentException(nameof(sfUserId));
        }

        IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(
            sfUserId,
            CancellationToken.None
        );
        return ptRepoSource.CanUserAuthenticateToPTArchives();
    }

    /// <summary> Get Paratext projects that a user has access to. </summary>
    public async Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret)
    {
        IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(
            userSecret.Id,
            CancellationToken.None
        );
        IEnumerable<SharedRepository> remotePtProjects = GetRepositories(
            ptRepoSource,
            $"Using SF user id {userSecret.Id}"
        );
        return GetProjects(userSecret, remotePtProjects, ptRepoSource.GetProjectsMetaData());
    }

    /// <summary>Get Paratext resources that a user has access to. </summary>
    public async Task<IReadOnlyList<ParatextResource>> GetResourcesAsync(string userId) =>
        await GetResourcesInternalAsync(userId, false, CancellationToken.None);

    /// <summary>
    /// Is the PT project referred to by `paratextId` a DBL resource?
    /// </summary>
    public bool IsResource(string paratextId) =>
        paratextId?.Length == SFInstallableDblResource.ResourceIdentifierLength;

    /// <summary>
    /// Determines whether the <see cref="TextData"/> for a resource project requires updating.
    /// </summary>
    /// <param name="project">The Scripture Forge project.</param>
    /// <param name="resource">The Paratext resource.</param>
    /// <returns>
    /// <c>true</c> if the project's documents require updating; otherwise, <c>false</c>.
    /// </returns>
    /// <remarks>
    /// This method is an implementation of <see cref="Paratext.Data.Archiving.InstallableResource.IsNewerThanCurrentlyInstalled" />
    /// specifically for comparing downloaded resources with the resource data in the Mongo database.
    /// If a non-resource project is specified, <c>true</c> is always returned.
    /// </remarks>
    public bool ResourceDocsNeedUpdating(SFProject project, ParatextResource resource)
    {
        // Ensure that we are checking a resource. We will default to true if it is not a resource.
        if (!IsResource(project.ParatextId))
        {
            return true;
        }

        // If we do not have a ResourceConfig, return true, as we have not synced this data into the database
        if (project.ResourceConfig == null)
        {
            _logger.LogInformation($"No resource configuration for '{project.ParatextId}' could be found.");
            return true;
        }

        // We use the latest revision, as all this data is from the Paratext feed
        if (resource.AvailableRevision > project.ResourceConfig.Revision)
        {
            return true;
        }

        if (resource.PermissionsChecksum != project.ResourceConfig.PermissionsChecksum)
        {
            return true;
        }

        // If the manifest is different, use the creation timestamp to ensure it is newer
        return resource.ManifestChecksum != project.ResourceConfig.ManifestChecksum
            && resource.CreatedTimestamp > project.ResourceConfig.CreatedTimestamp;
    }

    /// <summary>
    /// Returns `userSecret`'s role on a PT project according to the PT Registry.
    /// </summary>
    public async Task<Attempt<string>> TryGetProjectRoleAsync(
        UserSecret userSecret,
        string paratextId,
        CancellationToken token
    )
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
                string response = await CallApiAsync(
                    userSecret,
                    HttpMethod.Get,
                    $"projects/{paratextId}/members/{subClaim.Value}",
                    null,
                    token
                );
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
            IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(
                userSecret.Id,
                CancellationToken.None
            );
            IEnumerable<SharedRepository> remotePtProjects = GetRepositories(
                ptRepoSource,
                $"For SF user id {userSecret.Id} for unregistered PT project id {paratextId}"
            );
            string username = GetParatextUsername(userSecret);
            string role = ConvertFromUserRole(
                remotePtProjects
                    .SingleOrDefault(p => p.SendReceiveId.Id == paratextId)
                    ?.SourceUsers.Users.FirstOrDefault(u => u.UserName == username)
                    ?.Role
            );
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
    public string? GetParatextUsername(UserSecret userSecret)
    {
        string? username = _jwtTokenHelper.GetParatextUsername(userSecret);
        if (username is not null && _forcedUsernames.TryGetValue(username, out string forcedUsername))
            return forcedUsername;
        return username;
    }

    /// <summary> Force a Paratext username for a given user. </summary>
    /// <remarks>
    /// It is crucial to clear the forced usernames before or after synchronizing with Paratext.
    /// Since ParatextService is a singleton, forced usernames that not cleared will remain for subsequent syncs.
    /// </remarks>
    public void ForceParatextUsername(string username, string forcedUsername) =>
        _forcedUsernames.Add(username, forcedUsername);

    /// <summary> Clear forced usernames. </summary>
    public void ClearForcedUsernames() => _forcedUsernames.Clear();

    /// <summary>
    /// Gets the permission a user has to access a resource, according to a DBL server.
    /// </summary>
    /// <param name="paratextId">The paratext resource identifier.</param>
    /// <param name="sfUserId">The user SF identifier.</param>
    /// <param name="token">The cancellation token.</param>
    /// <returns>
    /// Read or None.
    /// </returns>
    /// <remarks>
    /// See <see cref="TextInfoPermission" /> for permission values.
    /// </remarks>
    public async Task<string> GetResourcePermissionAsync(string paratextId, string sfUserId, CancellationToken token)
    {
        // See if the source is even a resource
        if (!IsResource(paratextId))
        {
            // Default to no permissions for projects used as sources
            return TextInfoPermission.None;
        }

        bool canRead;
        try
        {
            UserSecret userSecret = await GetUserSecretWithCurrentParatextTokens(sfUserId, token);
            canRead = SFInstallableDblResource.CheckResourcePermission(
                paratextId,
                userSecret,
                _paratextOptions.Value,
                _restClientFactory,
                _fileSystemService,
                _jwtTokenHelper,
                ScrTextCollection,
                _exceptionHandler,
                _dblServerUri
            );
        }
        catch (UnauthorizedAccessException)
        {
            // This will usually be caused by refresh token expiration
            canRead = false;
        }

        return canRead ? TextInfoPermission.Read : TextInfoPermission.None;
    }

    private static string ExplainSRResults(IEnumerable<SendReceiveResult>? srResults)
    {
        return string.Join(
            ";",
            srResults?.Select(
                (SendReceiveResult r) =>
                    $"SR result: {r.Result}, "
                    + $"Revisions sent: {string.Join(",", r.RevisionsSent ?? Enumerable.Empty<string>())}, "
                    + $"Revisions received: {string.Join(",", r.RevisionsReceived ?? Enumerable.Empty<string>())}, "
                    + $"Failure message: {r.FailureMessage}."
            ) ?? []
        );
    }

    /// <summary>
    /// Queries the ParatextRegistry for the project and retrieves the users for that project.
    /// </summary>
    /// <param name="userSecret">The user secret.</param>
    /// <param name="project">The project - the UserRoles and ParatextId are used.</param>
    /// <param name="token">The cancellation token.</param>
    /// <returns>
    /// A list of <see cref="ParatextProjectUser"/> objects.
    /// </returns>
    public async Task<IReadOnlyList<ParatextProjectUser>> GetParatextUsersAsync(
        UserSecret userSecret,
        SFProject project,
        CancellationToken token
    )
    {
        // Skip all the work if the project is a resource
        List<ParatextProjectUser> users = [];
        if (IsResource(project.ParatextId))
        {
            // Resources don't have project members or roles
            return users;
        }
        else if (await IsRegisteredAsync(userSecret, project.ParatextId, token))
        {
            // Get the mapping for paratext users ids to usernames from the registry
            string response = await CallApiAsync(
                userSecret,
                HttpMethod.Get,
                $"projects/{project.ParatextId}/members",
                null,
                token
            );

            users =
            [
                .. JArray
                    .Parse(response)
                    .Where(m =>
                        !string.IsNullOrEmpty((string?)m["userId"])
                        && !string.IsNullOrEmpty((string)m["username"])
                        && !string.IsNullOrEmpty((string?)m["role"])
                    )
                    .Select(m => new ParatextProjectUser
                    {
                        ParatextId = (string)m["userId"] ?? string.Empty,
                        Role = (string)m["role"] ?? string.Empty,
                        Username = (string)m["username"] ?? string.Empty,
                    }),
            ];

            // Get the mapping of Scripture Forge user IDs to Paratext usernames
            string[] paratextIds = [.. users.Select(p => p.ParatextId)];
            Dictionary<string, string> userMapping = _realtimeService
                .QuerySnapshots<User>()
                .Where(u => paratextIds.Contains(u.ParatextId))
                .ToDictionary(u => u.ParatextId, u => u.Id);
            foreach (ParatextProjectUser user in users)
            {
                if (userMapping.TryGetValue(user.ParatextId, out string id))
                {
                    user.Id = id;
                }
            }

            return users;
        }
        /* If the project is not registered (e.g., back translation)
         or a user previously had sync access on the project has been removed
         you will end up here */
        else
        {
            // Get the list of users from the repository
            IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(
                userSecret.Id,
                CancellationToken.None
            );

            bool hasRole = project.UserRoles.TryGetValue(userSecret.Id, out string userRole);
            string contextInformation =
                $"For SF user id '{userSecret.Id}', "
                + $"while interested in unregistered PT project id '{project.ParatextId}' "
                + $"(SF project id {project.Id}). "
                + $"On SF project, user has {(hasRole ? $"role '{userRole}'." : "no role.")}";

            IEnumerable<SharedRepository> remotePtProjects = GetRepositories(ptRepoSource, contextInformation);

            SharedRepository remotePtProject =
                remotePtProjects.SingleOrDefault(p => p.SendReceiveId.Id == project.ParatextId)
                ?? throw new ForbiddenException();

            // Build a dictionary of user IDs mapped to usernames using the user secrets
            foreach (
                ParatextProjectUser user in project.UserRoles.Keys.Select(userId => new ParatextProjectUser
                {
                    Id = userId,
                })
            )
            {
                UserSecret projectUserSecret;
                if (user.Id == userSecret.Id)
                {
                    projectUserSecret = userSecret;
                }
                else
                {
                    projectUserSecret = await _userSecretRepository.GetAsync(user.Id);
                }

                // Get the PT role
                user.Username = GetParatextUsername(projectUserSecret) ?? string.Empty;
                if (string.IsNullOrWhiteSpace(user.Username))
                {
                    // Skip users that we do not have paratext information for
                    continue;
                }

                if (remotePtProject.SourceUsers is null)
                {
                    throw new InvalidDataException(
                        $"Unexpected null SourceUsers when working with PT project id {remotePtProject.SendReceiveId}."
                    );
                }

                if (remotePtProject.SourceUsers.Users is null)
                {
                    throw new InvalidDataException(
                        $"Unexpected null SourceUsers.Users when working with PT project id {remotePtProject.SendReceiveId}."
                    );
                }

                user.Role = ConvertFromUserRole(
                    remotePtProject
                        .SourceUsers.Users.SingleOrDefault(u =>
                        {
                            if (u is null)
                            {
                                _logger.LogWarning(
                                    $"An element of SourceUsers.Users was null when working with PT project id {remotePtProject.SendReceiveId}."
                                );
                            }
                            return u?.UserName == user.Username;
                        })
                        ?.Role
                );

                // Get the PT user ID
                var accessToken = new JwtSecurityToken(projectUserSecret.ParatextTokens.AccessToken);
                user.ParatextId =
                    accessToken.Claims.FirstOrDefault(c => c.Type == JwtClaimTypes.Subject)?.Value ?? string.Empty;

                // Only add if we have a user ID and role
                if (!string.IsNullOrEmpty(user.ParatextId) && !string.IsNullOrEmpty(user.Role))
                {
                    users.Add(user);
                }
            }

            // if the project is a back translation, we want to check if user is still
            // on project with permission to sync or return an error to UI
            if (!users.Select(u => u.Id).ToList().Contains(userSecret.Id))
                throw new ForbiddenException();

            return users;
        }
    }

    /// <summary>
    /// Gets the permissions for a project or resource.
    /// </summary>
    /// <param name="userSecret">The user secret.</param>
    /// <param name="sfProject">The project - the UserRoles and ParatextId are used.</param>
    /// <param name="ptUsernameMapping">A mapping of user ID to Paratext username.</param>
    /// <param name="book">The book number. Set to zero to check for all books.</param>
    /// <param name="chapter">The chapter number. Set to zero to check for all books.</param>
    /// <param name="token">The cancellation token.</param>
    /// <returns>
    /// A dictionary of permissions where the key is the user ID and the value is the permission.
    /// </returns>
    /// <remarks>
    /// See <see cref="TextInfoPermission" /> for permission values.
    /// A dictionary is returned, as permissions can be updated.
    /// </remarks>
    public async Task<Dictionary<string, string>> GetPermissionsAsync(
        UserSecret userSecret,
        SFProject sfProject,
        IReadOnlyDictionary<string, string> ptUsernameMapping,
        int book = 0,
        int chapter = 0,
        CancellationToken token = default
    )
    {
        var permissions = new Dictionary<string, string>();

        if (IsResource(sfProject.ParatextId))
        {
            foreach (string sfUserId in sfProject.UserRoles.Keys)
            {
                permissions.Add(sfUserId, await GetResourcePermissionAsync(sfProject.ParatextId, sfUserId, token));
            }
        }
        else
        {
            // Get the scripture text so we can retrieve the permissions from the XML
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), sfProject.ParatextId);

            // Calculate the project and resource permissions
            foreach (string uid in sfProject.UserRoles.Keys)
            {
                // See if the user is in the project members list
                if (
                    !ptUsernameMapping.TryGetValue(uid, out string userName)
                    || string.IsNullOrWhiteSpace(userName)
                    || scrText.Permissions.GetRole(userName) == UserRoles.None
                )
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
                            PermissionSet.Merged,
                            userName
                        );
                        // Check if they can edit all books or the specified book
                        if (scrText.Permissions.CanEditAllBooks(userName) || editable.Contains(book))
                        {
                            textInfoPermission = TextInfoPermission.Write;
                        }
                    }
                    else
                    {
                        // Chapter level
                        IEnumerable<int> editable = scrText.Permissions.GetEditableChapters(
                            book,
                            scrText.Settings.Versification,
                            userName,
                            PermissionSet.Merged
                        );
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
    private IEnumerable<SharedRepository> GetRepositories(
        IInternetSharedRepositorySource ptRepoSource,
        string contextInformation
    )
    {
        try
        {
            return ptRepoSource.GetRepositories();
        }
        catch (Paratext.Data.HttpException e)
        {
            string message = $"Problem fetching repositories: {contextInformation}";
            _logger.LogWarning(e, message);
            throw;
        }
    }

    /// <summary> Gets basic settings for a Paratext project. </summary>
    /// <returns> The Paratext project settings, or null if the project repository does not exist locally </returns>
    public ParatextSettings? GetParatextSettings(UserSecret userSecret, string paratextId)
    {
        using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
        if (scrText == null)
            return null;
        // Clear the cached comment tag file
        CommentTags.ClearCacheForProject(scrText);
        CommentTags commentTags = CommentTags.Get(scrText);
        IEnumerable<NoteTag> noteTags = commentTags
            .GetAllTags()
            .Select(t => new NoteTag
            {
                TagId = t.Id,
                Icon = t.Icon,
                Name = t.Name,
                CreatorResolve = t.CreatorResolve,
            });

        // If the copyright banner is blank or empty, make it null so it will not be displayed
        string? copyrightBanner = scrText.CopyrightBannerText;
        if (string.IsNullOrWhiteSpace(copyrightBanner))
        {
            copyrightBanner = null;
        }

        // Get the copyright notice in the same way
        string? copyrightNotice = scrText.Settings.Copyright;
        if (string.IsNullOrWhiteSpace(copyrightNotice))
        {
            copyrightNotice = null;
        }

        // Get the writing system details
        WritingSystem writingSystem = GetWritingSystem(scrText.Settings.LanguageID.Id);
        return new ParatextSettings
        {
            FullName = scrText.FullName,
            IsRightToLeft = scrText.RightToLeft,
            Editable = scrText.Settings.Editable,
            DefaultFontSize = scrText.Settings.DefaultFontSize,
            DefaultFont = scrText.Settings.DefaultFont,
            NoteTags = noteTags,
            LanguageRegion = writingSystem.Region,
            LanguageScript = writingSystem.Script,
            LanguageTag = writingSystem.Tag,
            ProjectType = scrText.Settings.TranslationInfo.Type.ToString(),
            BaseProjectParatextId = scrText.Settings.TranslationInfo.BaseProjectGuid?.Id,
            BaseProjectShortName = scrText.Settings.TranslationInfo.BaseProjectName,
            CopyrightBanner = copyrightBanner,
            CopyrightNotice = copyrightNotice,
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

    /// <summary>
    /// Gets a book's text in USX, with the option of overriding the USFM.
    /// </summary>
    /// <param name="userSecret">The user secret.</param>
    /// <param name="paratextId">The Paratext project identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="usfm">Optional. Override the USFM.</param>
    /// <returns>The book's contents as USX.</returns>
    /// <exception cref="DataNotFoundException">The project cannot be accessed.</exception>
    /// <remarks>Specify the USFM if you are parsing USFM from another source (i.e. Serval) for this book.</remarks>
    public string GetBookText(UserSecret userSecret, string paratextId, int bookNum, string? usfm = null)
    {
        using ScrText scrText =
            ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId)
            ?? throw new DataNotFoundException("Can't get access to cloned project.");
        usfm ??= scrText.GetText(bookNum);
        return UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
    }

    /// <summary>
    /// Gets the chapters of a book in USJ format.
    /// </summary>
    /// <param name="userSecret">The user secret</param>
    /// <param name="paratextId">The Paratext identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="usfm">The USFM string.</param>
    /// <returns>A collection of Usj objects.</returns>
    /// <exception cref="ForbiddenException">The user secret is invalid.</exception>
    /// <exception cref="DataNotFoundException">The Paratext project could not be found.</exception>
    public IEnumerable<Usj> GetChaptersAsUsj(UserSecret userSecret, string paratextId, int bookNum, string usfm)
    {
        string username = GetParatextUsername(userSecret) ?? throw new ForbiddenException();
        using ScrText scrText =
            ScrTextCollection.FindById(username, paratextId)
            ?? throw new DataNotFoundException("Can't get access to cloned project.");

        foreach (string chapterUsfm in ScrText.SplitIntoChapters(scrText.Name, bookNum, usfm))
        {
            yield return UsxToUsj.UsxXmlDocumentToUsj(
                UsfmToUsx.ConvertToXmlDocument(scrText, scrText.ScrStylesheet(bookNum), chapterUsfm, forExport: false)
            );
        }
    }

    /// <summary>
    /// Converts USX to USFM.
    /// </summary>
    /// <param name="userSecret">The user secret</param>
    /// <param name="paratextId">The Paratext identifier.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="usx">The USX XDocument.</param>
    /// <returns>The USFM.</returns>
    /// <exception cref="ArgumentException">The <paramref name="paratextId"/> parameter is not defined.</exception>
    /// <exception cref="ArgumentNullException">
    /// The <paramref name="userSecret"/> or <paramref name="usx"/> parameters are not defined.
    /// </exception>
    /// <exception cref="ForbiddenException">The user secret is invalid.</exception>
    /// <exception cref="DataNotFoundException">The Paratext user or project does not exist.</exception>
    public string ConvertUsxToUsfm(UserSecret userSecret, string paratextId, int bookNum, XDocument usx)
    {
        ArgumentNullException.ThrowIfNull(userSecret, nameof(userSecret));
        ArgumentException.ThrowIfNullOrWhiteSpace(paratextId, nameof(paratextId));
        ArgumentNullException.ThrowIfNull(usx, nameof(usx));

        // Get the username
        string username = GetParatextUsername(userSecret) ?? throw new ForbiddenException();

        using ScrText scrText =
            ScrTextCollection.FindById(username, paratextId)
            ?? throw new DataNotFoundException("Paratext project not found");
        return ConvertXDocumentToUsfm(scrText, bookNum, usx);
    }

    /// <summary> Write up-to-date book text from mongo database to Paratext project folder. </summary>
    /// <remarks> It is up to the caller to determine whether the project text is editable. </remarks>
    public async Task<int> PutBookText(
        UserSecret userSecret,
        string paratextId,
        int bookNum,
        XDocument usx,
        Dictionary<int, string> chapNumToAuthorSFUserIdMap = null
    )
    {
        if (userSecret == null)
        {
            throw new ArgumentNullException(nameof(userSecret));
        }
        if (string.IsNullOrWhiteSpace(paratextId))
        {
            throw new ArgumentNullException(nameof(paratextId));
        }

        int booksUpdated = 0;
        StringBuilder log = new StringBuilder(
            $"ParatextService.PutBookText(userSecret, paratextId {paratextId}, bookNum {bookNum}, usx {usx.Root}, chapterAuthors: {(chapNumToAuthorSFUserIdMap == null ? "null" : ($"count {chapNumToAuthorSFUserIdMap.Count}"))})"
        );
        Dictionary<string, ScrText> scrTexts = [];
        try
        {
            log.AppendLine(
                $"Querying userSecret (id {userSecret.Id}, tokens null: {userSecret.ParatextTokens == null}) for username."
            );
            string username = GetParatextUsername(userSecret);
            log.AppendLine(
                $"Acquired username: {(username == null ? "is null" : (username.Length == 0 ? "zero length" : "yes"))}"
            );
            using ScrText scrText = ScrTextCollection.FindById(username, paratextId);

            // We add this here so we can dispose in the finally
            scrTexts.Add(userSecret.Id, scrText);
            string usfm = ConvertXDocumentToUsfm(scrText!, bookNum, usx, log);

            if (chapNumToAuthorSFUserIdMap == null || chapNumToAuthorSFUserIdMap.Count == 0)
            {
                log.AppendLine($"Using current user ({userSecret.Id}) to write book {bookNum} to {scrText.Name}.");
                // If we don't have chapter authors, update book as current user
                WriteChapterToScrText(scrText, userSecret.Id, bookNum, 0, usfm);
                booksUpdated++;
            }
            else
            {
                // As we have a list of chapter authors, build a dictionary of ScrTexts for each of them
                foreach (string sfUserId in chapNumToAuthorSFUserIdMap.Values.Distinct())
                {
                    if (sfUserId != userSecret.Id)
                    {
                        // Get their user secret, so we can get their username, and create their ScrText
                        log.AppendLine($"Fetching user secret for SF user id '{sfUserId}'.");
                        UserSecret authorUserSecret = await _userSecretRepository.GetAsync(sfUserId);
                        log.AppendLine(
                            $"Received user secret: {(authorUserSecret == null ? "null" : (authorUserSecret.ParatextTokens == null ? "with null tokens" : "with tokens"))}"
                        );
                        log.AppendLine($"Fetching PT username from secret.");
                        string authorUserName = GetParatextUsername(authorUserSecret);
                        log.AppendLine(
                            $"Received username: {(authorUserName == null ? "null" : (authorUserName.Length == 0 ? "empty" : "non-empty"))}"
                        );
                        log.AppendLine($"Fetching scrtext using this authorUserName for PT project.");
                        ScrText scrTextForUser = ScrTextCollection.FindById(authorUserName, paratextId);
                        log.AppendLine(
                            $"Received ScrText: {(scrTextForUser == null ? "null" : (scrTextForUser.Name))}"
                        );
                        scrTexts.Add(sfUserId, scrTextForUser);
                    }
                }

                // If there is only one author, just write the book
                if (scrTexts.Count == 1)
                {
                    try
                    {
                        ScrText target = scrTexts.Values.First();
                        string authorSFUserId = scrTexts.Keys.First();
                        log.AppendLine(
                            $"Using single author (SF user id '{authorSFUserId}') to write to {target.Name} book {bookNum}."
                        );
                        WriteChapterToScrText(target, authorSFUserId, bookNum, 0, usfm);
                    }
                    catch (SafetyCheckException e)
                    {
                        log.AppendLine(
                            $"There was trouble writing ({e.Message}). Trying again, but using SF user id '{userSecret.Id}' to write to {scrText.Name}"
                        );
                        // If the author does not have permission, attempt to run as the current user
                        WriteChapterToScrText(scrText, userSecret.Id, bookNum, 0, usfm);
                    }

                    booksUpdated++;
                }
                else
                {
                    log.AppendLine($"There are multiple authors. Splitting USFM into chapters.");
                    // Split the usfm into chapters
                    List<string> chapters = ScrText.SplitIntoChapters(scrText.Name, bookNum, usfm);
                    log.AppendLine($"Received chapters: {(chapters == null ? "null" : ($"count {chapters.Count}"))}");

                    // Put the individual chapters
                    foreach ((int chapterNum, string authorSFUserId) in chapNumToAuthorSFUserIdMap)
                    {
                        if ((chapterNum - 1) < chapters.Count)
                        {
                            try
                            {
                                ScrText target = scrTexts[authorSFUserId];
                                string payloadUsfm = chapters[chapterNum - 1];
                                log.AppendLine(
                                    $"Writing to {target.Name}, chapter {chapterNum}, using author SF user id {authorSFUserId}, the usfm: {payloadUsfm}"
                                );
                                // The ScrText permissions will be the same as the last sync's permissions
                                WriteChapterToScrText(target, authorSFUserId, bookNum, chapterNum, payloadUsfm);
                            }
                            catch (SafetyCheckException e)
                            {
                                log.AppendLine(
                                    $"There was trouble writing ({e.Message}). Trying again, but using SF user id '{userSecret.Id}' to write to {scrText.Name}. Also now writing the whole book, not just the single chapter."
                                );
                                // If the author does not have permission, attempt to run as the current user
                                WriteChapterToScrText(scrText, userSecret.Id, bookNum, 0, usfm);
                            }
                        }
                        else
                        {
                            log.AppendLine($"Not processing erroneous chapter number '{chapterNum}'");
                        }
                    }

                    booksUpdated++;
                }
            }
        }
        catch (Exception e)
        {
            log.AppendLine($"An exception occurred while processing: {e}");
            log.AppendLine($"ScrTexts contained {scrTexts.Count} projects.");
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

        return booksUpdated;
    }

    /// <summary> Get notes from the Paratext project folder. </summary>
    public string GetNotes(UserSecret userSecret, string paratextId, int bookNum)
    {
        // TODO: should return some data structure instead of XML
        using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
        if (scrText == null)
            return null;

        CommentManager manager = CommentManager.Get(scrText);

        // We will query the VerseRefStr value, rather than VerseRef to speed up this query
        string verseRefBook = Canon.BookNumberToId(bookNum) + " ";

        // CommentThread.VerseRef determines the location of a thread, even if moved. However, in Paratext a note can
        // only be relocated within the chapter, so for our query, we only need to look at the first note location.
        var threads = manager.FindThreads(
            commentThread =>
                commentThread.Comments[0].VerseRefStr.StartsWith(verseRefBook, StringComparison.OrdinalIgnoreCase),
            true
        );
        return NotesFormatter.FormatNotes(threads);
    }

    /// <summary> Write up-to-date notes from the mongo database to the Paratext project folder </summary>
    public SyncMetricInfo PutNotes(UserSecret userSecret, string paratextId, XElement notesElement)
    {
        // TODO: should accept some data structure instead of XML
        var changeList = NotesFormatter.ParseNotes(notesElement, new SFParatextUser(GetParatextUsername(userSecret)));
        return PutCommentThreads(userSecret, paratextId, changeList);
    }

    /// <summary>
    /// Returns a list of changes to apply to SF note threads to match the corresponding
    /// PT comment threads for a given book.
    /// </summary>
    /// <remarks>If <paramref name="bookNum"/> is null, Note Thread Changes for Biblical Terms are returned</remarks>
    public IEnumerable<NoteThreadChange> GetNoteThreadChanges(
        UserSecret userSecret,
        string paratextId,
        int? bookNum,
        IEnumerable<IDocument<NoteThread>> noteThreadDocs,
        Dictionary<int, ChapterDelta> chapterDeltas,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        CommentManager commentManager = GetCommentManager(userSecret, paratextId);
        CommentTags commentTags = GetCommentTags(userSecret, paratextId);
        List<string> matchedThreadIds = [];
        List<NoteThreadChange> changes = [];
        IEnumerable<IDocument<NoteThread>> activeNoteThreadDocs = noteThreadDocs.Where(nt =>
            nt.Data.Notes.Any(n => !n.Deleted)
        );

        foreach (var threadDoc in activeNoteThreadDocs)
        {
            List<string> matchedCommentIds = [];
            NoteThreadChange threadChange = new NoteThreadChange(
                threadDoc.Data.DataId,
                threadDoc.Data.ThreadId,
                threadDoc.Data.VerseRef.ToString(),
                threadDoc.Data.OriginalSelectedText,
                threadDoc.Data.OriginalContextBefore,
                threadDoc.Data.OriginalContextAfter,
                threadDoc.Data.Status,
                threadDoc.Data.Assignment,
                threadDoc.Data.BiblicalTermId,
                threadDoc.Data.ExtraHeadingInfo
            );
            // Find the corresponding comment thread
            CommentThread? existingThread = commentManager.FindThread(threadDoc.Data.ThreadId);
            if (existingThread is null)
            {
                // The thread has been removed
                threadChange.NoteIdsRemoved = [.. threadDoc.Data.Notes.Where(n => !n.Deleted).Select(n => n.DataId)];
                if (threadChange.NoteIdsRemoved.Count > 0)
                    changes.Add(threadChange);
                continue;
            }
            matchedThreadIds.Add(existingThread.Id);
            foreach (Note note in threadDoc.Data.Notes)
            {
                Paratext.Data.ProjectComments.Comment? matchedComment = GetMatchingCommentFromNote(
                    note,
                    existingThread,
                    ptProjectUsers
                );
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
                else if (!note.Deleted)
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

            // Add new Comments to note thread change
            IEnumerable<string> ptCommentIds = existingThread.Comments.Select(c => c.Id);
            IEnumerable<string> newCommentIds = ptCommentIds.Except(matchedCommentIds);
            foreach (string commentId in newCommentIds)
            {
                // If there are duplicates, we only retrieve the first, although Paratext displays both
                // Actions (like Delete) performed on duplicates in Paratext affect both duplicates.
                Paratext.Data.ProjectComments.Comment comment = existingThread.Comments.First(c => c.Id == commentId);
                CommentTag commentIconTag = GetCommentTag(existingThread, comment, commentTags);
                threadChange.AddChange(
                    CreateNoteFromComment(_guidService.NewObjectId(), comment, commentIconTag, ptProjectUsers),
                    ChangeType.Added
                );
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

        IEnumerable<CommentThread> commentThreads = GetCommentThreads(commentManager, bookNum);
        IEnumerable<string> ptThreadIds = commentThreads.Select(ct => ct.Id);
        IEnumerable<string> newThreadIds = ptThreadIds.Except(matchedThreadIds);
        foreach (string threadId in newThreadIds)
        {
            CommentThread? thread = commentManager.FindThread(threadId);
            if (thread is null || thread.Comments.All(c => c.Deleted))
                continue;
            Paratext.Data.ProjectComments.Comment info = thread.Comments[0];
            NoteThreadChange newThread = new NoteThreadChange(
                null,
                threadId,
                info.VerseRefStr,
                info.SelectedText,
                info.ContextBefore,
                info.ContextAfter,
                info.Status.InternalValue,
                info.AssignedUser,
                info.BiblicalTermId,
                info.ExtraHeadingInfo == null
                    ? null
                    : new BiblicalTermNoteHeadingInfo
                    {
                        Gloss = info.ExtraHeadingInfo.Gloss,
                        Language = info.ExtraHeadingInfo.Language,
                        Lemma = info.ExtraHeadingInfo.Lemma,
                        Transliteration = info.ExtraHeadingInfo.Transliteration,
                    }
            )
            {
                Position = GetThreadTextAnchor(thread, chapterDeltas),
                Status = thread.Status.InternalValue,
                Assignment = GetAssignedUserRef(thread.AssignedUser, ptProjectUsers),
            };
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

    public async Task<SyncMetricInfo> UpdateParatextCommentsAsync(
        UserSecret userSecret,
        string paratextId,
        IEnumerable<IDocument<NoteThread>> noteThreadDocs,
        IReadOnlyDictionary<string, string> displayNames,
        Dictionary<string, ParatextUserProfile> ptProjectUsers,
        int sfNoteTagId
    )
    {
        string? username = GetParatextUsername(userSecret);
        CommentManager commentManager = GetCommentManager(userSecret, paratextId);
        List<List<Paratext.Data.ProjectComments.Comment>> noteThreadChangeList = await SFNotesToCommentChangeListAsync(
            noteThreadDocs,
            commentManager,
            username,
            sfNoteTagId,
            displayNames,
            ptProjectUsers
        );

        return PutCommentThreads(userSecret, paratextId, noteThreadChangeList);
    }

    /// <summary> Adds the comment tag to the list of comment tags if that tag does not already exist. </summary>
    /// <returns> The id of the tag that was added. </returns>
    public int UpdateCommentTag(UserSecret userSecret, string paratextId, NoteTag noteTag)
    {
        CommentTags commentTags = GetCommentTags(userSecret, paratextId);
        if (noteTag.TagId != NoteTag.notSetId)
        {
            // Disallow updating existing comment tags from SF
            throw new ArgumentException("Cannot update an existing comment tag via Scripture Forge");
        }
        var newCommentTag = new CommentTag(noteTag.Name, noteTag.Icon);
        // Check that the tag does not already exist
        if (commentTags.FindMatchingTag(newCommentTag) == CommentTag.toDoTagId)
        {
            // The to do tag is returned as the default if a matching tag does not exist
            commentTags.AddOrUpdate(newCommentTag);
        }
        return commentTags.FindMatchingTag(newCommentTag);
    }

    /// <summary>
    /// Gets the Biblical Terms with Renderings from the Paratext project.
    /// </summary>
    /// <param name="userSecret">The user secret.</param>
    /// <param name="paratextId">The Paratext identifier.</param>
    /// <param name="books">The book numbers to retrieve the terms for.</param>
    /// <returns>An object with the Biblical Terms with Renderings or the error message.</returns>
    public async Task<BiblicalTermsChanges> GetBiblicalTermsAsync(
        UserSecret userSecret,
        string paratextId,
        IEnumerable<int> books
    )
    {
        // Remove the Biblical Terms Parallel Deserializer
        Memento.AddParallelDeserializer<BiblicalTermsList>(null);

        // Get the ScrText, returning empty biblical terms if it is missing
        using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret)!, paratextId);
        if (scrText is null)
        {
            // Log the error and return the empty biblical terms collection. Biblical Terms will be disabled.
            const string message = "The Paratext Project is not accessible from Scripture Forge.";
            _logger.LogError(message);
            return new BiblicalTermsChanges { ErrorCode = BiblicalTermErrorCode.NotAccessible, ErrorMessage = message };
        }

        // The biblical terms ScrText, if defined, must be disposed properly
        ScrText? biblicalTermsScrText = null;
        try
        {
            // Get the biblical terms specified in settings
            string biblicalTermsList = scrText.Settings.GetSetting(Setting.BiblicalTermsListSetting);
            string[] biblicalTermsListParts = biblicalTermsList.Split(':');
            BiblicalTermsInfo biblicalTermsInfo;
            if (biblicalTermsListParts.Length > 2 && !string.IsNullOrEmpty(biblicalTermsListParts[1]))
            {
                // Find the project, then load the ScrText
                string biblicalTermsProjectParatextId = await _realtimeService
                    .QuerySnapshots<SFProject>()
                    .Where(p => p.ShortName == biblicalTermsListParts[1])
                    .Select(p => p.ParatextId)
                    .FirstOrDefaultAsync();
                if (string.IsNullOrWhiteSpace(biblicalTermsProjectParatextId))
                {
                    // Log the error and return the empty biblical terms collection. Biblical Terms will be disabled.
                    string message =
                        $"The Biblical Terms project ({biblicalTermsListParts[1]}) has not been synced to "
                        + "Scripture Forge.";
                    _logger.LogError(message);
                    return new BiblicalTermsChanges
                    {
                        ErrorCode = BiblicalTermErrorCode.NotSynced,
                        ErrorMessage = message,
                    };
                }

                // Load the biblical terms project
                biblicalTermsScrText = ScrTextCollection.FindById(
                    GetParatextUsername(userSecret)!,
                    biblicalTermsProjectParatextId
                );
                if (biblicalTermsScrText is null)
                {
                    // Log the error and return the empty biblical terms collection. Biblical Terms will be disabled.
                    string message =
                        "Biblical Terms could not be retrieved during Sync because the user "
                        + $"{GetParatextUsername(userSecret)} does not have permission to read the Biblical Terms "
                        + "project defined in Paratext.";
                    _logger.LogError(message);
                    return new BiblicalTermsChanges
                    {
                        ErrorCode = BiblicalTermErrorCode.NoPermission,
                        ErrorMessage = message,
                    };
                }

                Enum<BiblicalTermsListType> listType = string.IsNullOrEmpty(biblicalTermsListParts[0])
                    ? BiblicalTermsListType.Major
                    : new Enum<BiblicalTermsListType>(biblicalTermsListParts[0]);
                biblicalTermsInfo = new BiblicalTermsInfo(biblicalTermsListParts[2], biblicalTermsScrText, listType);
            }
            else
            {
                // Use major biblical terms if it is not set
                biblicalTermsInfo = string.IsNullOrEmpty(biblicalTermsList)
                    ? new BiblicalTermsInfo(BiblicalTermsListType.Major)
                    : new BiblicalTermsInfo(scrText, biblicalTermsList);
            }

            // Clear the persistent profile cache, as term rendering file is cached
            PersistedProjectFile.ClearCacheForProject(scrText);

            // Get the term renderings
            TermRenderings termRenderings = TermRenderings.GetTermRenderings(scrText);
            BiblicalTermsChanges biblicalTermsChanges = new BiblicalTermsChanges
            {
                HasRenderings = termRenderings.SomeRenderingsPresent,
            };

            // Load the biblical terms from the project settings (i.e. the terms this project's terms are based on)
            BiblicalTerms projectSettingsBiblicalTerms = BiblicalTerms.GetBiblicalTerms(biblicalTermsInfo);

            // Get the term localizations
            Dictionary<string, TermLocalizations> allTermLocalizations = TermLocalizations
                .LanguagesAvailable.Select(language =>
                    (language, termLocalizations: TermLocalizations.GetTermLocalizations(language))
                )
                .ToDictionary(l => l.language, l => l.termLocalizations);

            // Create the collection of Biblical Terms with Renderings
            foreach (
                Term term in projectSettingsBiblicalTerms.Terms.Where(t =>
                    t.VerseRefs().Any(v => books.Contains(v.BookNum))
                )
            )
            {
                TermRendering termRendering = termRenderings.GetRendering(term.Id);
                Dictionary<string, BiblicalTermDefinition> definitions = [];
                foreach ((string language, TermLocalizations termLocalizations) in allTermLocalizations)
                {
                    TermLocalization termLocalization = termLocalizations.GetTermLocalization(term.Id);
                    BiblicalTermDefinition biblicalTermDefinition = new BiblicalTermDefinition
                    {
                        Categories = [.. term.CategoryIds.Select(termLocalizations.GetCategoryLocalization)],
                        Domains = [.. term.SemanticDomains.Select(termLocalizations.GetDomainLocalization)],
                        Gloss = !string.IsNullOrEmpty(termLocalization.Gloss) ? termLocalization.Gloss : term.Gloss,
                        Notes = termLocalization.Notes,
                    };
                    definitions.Add(FixLanguageCode(language), biblicalTermDefinition);
                }

                BiblicalTerm biblicalTerm = new BiblicalTerm
                {
                    TermId = term.Id,
                    Transliteration = term.Transliteration,
                    Renderings = [.. termRendering.RenderingsEntries],
                    Description = termRendering.Notes,
                    Language = term.Language,
                    Links = [.. term.Links],
                    References = [.. term.VerseRefs().Select(v => v.BBBCCCVVV)],
                    Definitions = definitions,
                };
                biblicalTermsChanges.BiblicalTerms.Add(biblicalTerm);
            }

            return biblicalTermsChanges;
        }
        finally
        {
            // Dispose the Biblical Terms ScrText from Settings, if it was set
            biblicalTermsScrText?.Dispose();
        }
    }

    /// <summary>
    /// Updates Biblical Term renderings in Paratext with the values from Scripture Forge.
    /// </summary>
    /// <param name="userSecret">The user secret.</param>
    /// <param name="paratextId">The Paratext identifier.</param>
    /// <param name="biblicalTerms">The Biblical Terms to update in Paratext.</param>
    public void UpdateBiblicalTerms(UserSecret userSecret, string paratextId, IReadOnlyList<BiblicalTerm> biblicalTerms)
    {
        if (!biblicalTerms.Any())
        {
            return;
        }

        using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret)!, paratextId);
        if (scrText is null)
        {
            return;
        }

        // Get and update the term renderings
        TermRenderings termRenderings = TermRenderings.GetTermRenderings(scrText);
        using (termRenderings.UpdateLock())
        {
            foreach (BiblicalTerm biblicalTerm in biblicalTerms)
            {
                TermRendering termRendering = termRenderings.GetRendering(biblicalTerm.TermId);
                termRendering.Notes = biblicalTerm.Description;
                termRendering.RenderingsEntries = biblicalTerm.Renderings;
                termRendering.Guess = false;
            }
        }

        termRenderings.Save();
    }

    /// <summary>
    /// Get the most recent revision id of a commit from the last push or pull with the PT send/receive server.
    /// </summary>
    public string? GetLatestSharedVersion(UserSecret userSecret, string paratextId)
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

    /// <summary>Returns the current revision of the local hg repo for a given PT project id,
    /// accessed using a given user.</summary>
    public string GetRepoRevision(UserSecret userSecret, string paratextId)
    {
        if (IsResource(paratextId))
        {
            throw new InvalidOperationException("Cannot query a resource for an hg repo revision.");
        }
        using ScrText scrText = GetScrText(userSecret, paratextId);
        return _hgHelper.GetRepoRevision(scrText.Directory);
    }

    /// <summary>Set a project local hg repo to a given Mercurial revision. Accessed by a given user.</summary>>
    public void SetRepoToRevision(UserSecret userSecret, string paratextid, string desiredRevision)
    {
        if (IsResource(paratextid))
        {
            throw new InvalidOperationException("Cannot query a resource for an hg repo revision.");
        }
        using ScrText scrText = GetScrText(userSecret, paratextid);
        // Act
        _hgHelper.Update(scrText.Directory, desiredRevision);
        // Verify
        string currentRepoRev = GetRepoRevision(userSecret, paratextid);
        if (currentRepoRev != desiredRevision)
        {
            throw new Exception(
                $"SetRepoToRevision failed to set repo for PT project id {paratextid} to revision {desiredRevision}, as the resulting revision is {currentRepoRev}."
            );
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
        if (paratextId == null || IsResource(paratextId))
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
        return BackupExistsInternal(scrText);
    }

    public bool BackupRepository(UserSecret userSecret, string paratextId)
    {
        // We do not back up resources
        if (paratextId == null || IsResource(paratextId))
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
        if (paratextId == null || IsResource(paratextId))
        {
            if (paratextId == null)
            {
                _logger.LogInformation("Not restoring local PT repo for null paratextId.");
            }
            else if (IsResource(paratextId))
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
        if (BackupExistsInternal(scrText))
        {
            string source = scrText.Directory;
            string destination = Path.Combine(
                Paratext.Data.ScrTextCollection.SettingsDirectory,
                "_Backups",
                scrText.Guid.ToString()
            );
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

    /// <summary>Does a local directory exist for the project? (i.e. in /var/lib/...)</summary>
    public bool LocalProjectDirExists(string paratextId)
    {
        string dir = LocalProjectDir(paratextId);
        return _fileSystemService.DirectoryExists(dir);
    }

    /// <summary>
    /// Gets the Language tag for a Paratext project.
    /// </summary>
    /// <param name="userSecret">The user secret.</param>
    /// <param name="ptProjectId">The Project identifier</param>
    /// <returns>The Language identifier.</returns>
    /// <remarks>This is used to get the WritingSystem Tag for Back Translations.</remarks>
    public WritingSystem GetWritingSystem(UserSecret userSecret, string ptProjectId)
    {
        using ScrText scrText = GetScrText(userSecret, ptProjectId);
        return GetWritingSystem(scrText.Settings.LanguageID.Id);
    }

    public void ClearParatextDataCaches(UserSecret userSecret, string paratextId)
    {
        ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
        if (scrText is not null)
        {
            // The comment manager is kept in a MRU cache
            CommentManager.RemoveCommentManager(scrText);
        }

        // Clear the versioning manager cache
        VersioningManager.Reset();
    }

    public void InitializeCommentManager(UserSecret userSecret, string paratextId)
    {
        ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
        if (scrText is not null)
        {
            // Initialize the comment manager without a parallel deserializer
            CommentManager commentManager = CommentManager.Get(scrText);
            Memento.AddParallelDeserializer<CommentList>(null);
            commentManager.Load();
        }
    }

    public async Task<TextSnapshot> GetSnapshotAsync(
        UserSecret userSecret,
        string sfProjectId,
        string book,
        int chapter,
        DateTime timestamp
    )
    {
        await using IConnection connection = await _realtimeService.ConnectAsync(userSecret.Id);

        // Load the project so we can check security and get the Paratext Id
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(sfProjectId);
        await projectDoc.FetchAsync();
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("Project does not exist.");
        }

        if (
            !projectDoc.Data.UserRoles.TryGetValue(userSecret.Id, out string role)
            || !SFProjectRole.IsParatextRole(role)
        )
        {
            throw new ForbiddenException();
        }

        // Ensure that the timestamp is UTC
        timestamp = DateTime.SpecifyKind(timestamp, DateTimeKind.Utc);

        // Load the Paratext project
        string ptProjectId = projectDoc.Data.ParatextId;
        using ScrText scrText = GetScrText(userSecret, ptProjectId);
        VerseRef verseRef = new VerseRef($"{book} {chapter}:0");

        TextSnapshot ret;
        string id = TextData.GetTextDocId(sfProjectId, book, chapter);
        Snapshot<TextData> snapshot = await connection.FetchSnapshotAsync<TextData>(id, timestamp);

        if (snapshot.Data is null)
        {
            // We do not have a snapshot, so retrieve the data from Paratext
            // Note: The following code is not testable due to ParatextData limitations

            // Retrieve the first revision before or at the timestamp
            VersionedText versionedText = VersioningManager.Get(scrText);
            HgRevisionCollection revisionCollection = HgRevisionCollection.Get(scrText);
            DateTimeOffset timeStampOffset = new DateTimeOffset(timestamp, TimeSpan.Zero);
            HgRevision? revision = revisionCollection
                .FilterRevisions(r => r.CommitTimeStamp <= timeStampOffset)
                .MaxBy(r => r.CommitTimeStamp);

            // No revision was before the timestamp, so get the first revision
            revision ??= revisionCollection.MinBy(r => r.LocalRevisionNumber);
            if (revision is null)
            {
                throw new DataNotFoundException("A snapshot cannot be retrieved at that timestamp");
            }

            // Retrieve the USFM for the chapter, and convert to USX, then to deltas
            IGetText version = versionedText.GetVersion(revision.Id);
            string usfm = version.GetText(verseRef, true, false);
            ChapterDelta chapterDelta = GetDeltaFromUsfm(scrText, verseRef.BookNum, usfm);
            ret = new TextSnapshot
            {
                Id = id,
                Version = 0,
                Data = new TextData(chapterDelta.Delta),
                IsValid = chapterDelta.IsValid,
            };
        }
        else
        {
            // We have the snapshot, but we need to determine if it's valid
            var usfm = scrText.GetText(verseRef.BookNum);
            ChapterDelta chapterDelta = GetDeltaFromUsfm(scrText, verseRef.BookNum, usfm);
            ret = new TextSnapshot
            {
                Id = snapshot.Id,
                Version = snapshot.Version,
                Data = snapshot.Data,
                IsValid = chapterDelta.IsValid,
            };
        }

        return ret;
    }

    public async IAsyncEnumerable<DocumentRevision> GetRevisionHistoryAsync(
        UserSecret userSecret,
        string sfProjectId,
        string book,
        int chapter
    )
    {
        await using IConnection connection = await _realtimeService.ConnectAsync(userSecret.Id);

        // Load the project so we can check security
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(sfProjectId);
        await projectDoc.FetchAsync();
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("Project does not exist.");
        }

        if (
            !projectDoc.Data.UserRoles.TryGetValue(userSecret.Id, out string role)
            || !SFProjectRole.IsParatextRole(role)
        )
        {
            throw new ForbiddenException();
        }

        string id = TextData.GetTextDocId(sfProjectId, book, chapter);
        Op[] ops = await connection.GetOpsAsync<TextData>(id);

        // Iterate over the ops in reverse order, returning a milestone at least every 15 minutes
        const int interval = 15;
        DateTime milestonePeriod = DateTime.MaxValue;
        DocumentRevision documentRevision = new DocumentRevision { Timestamp = DateTime.UtcNow };
        int milestoneOps = 0;
        for (int i = ops.Length - 1; i >= 0; i--)
        {
            Op op = ops[i];
            if (
                op.Metadata.Timestamp < milestonePeriod.AddMinutes(0 - interval)
                || op.Metadata.Source != documentRevision.Source
                || op.Metadata.UserId != documentRevision.UserId
            )
            {
                // If this is not the first op, emit the revision
                if (milestoneOps > 0)
                {
                    yield return documentRevision;
                    milestoneOps = 1;
                }

                // Get the next interval by rounding up to the nearest interval
                milestonePeriod = op.Metadata.Timestamp.AddMinutes(
                    interval - (op.Metadata.Timestamp.Minute % interval)
                );
                milestonePeriod = milestonePeriod.AddSeconds(-milestonePeriod.Second);
                milestonePeriod = milestonePeriod.AddMilliseconds(-milestonePeriod.Millisecond);

                // As this is the latest op in the new period, it will define the milestone
                documentRevision = new DocumentRevision
                {
                    Source = op.Metadata.Source,
                    Timestamp = op.Metadata.Timestamp,
                    UserId = op.Metadata.UserId,
                };
            }

            milestoneOps++;
        }

        // Emit the last op(s), if not emitted already
        if (milestoneOps > 0)
        {
            yield return documentRevision;
        }

        // Get the earlier op's timestamp (UTC)
        milestonePeriod = ops.FirstOrDefault()?.Metadata.Timestamp ?? DateTime.UtcNow;

        // Load the Paratext project
        ScrText scrText;
        try
        {
            string ptProjectId = projectDoc.Data.ParatextId;
            scrText = GetScrText(userSecret, ptProjectId);
        }
        catch (DataNotFoundException)
        {
            // If an error occurs loading the project from disk, just return the revisions from Mongo
            yield break;
        }

        // Get the Paratext users
        Dictionary<string, string> paratextUsers = projectDoc.Data.ParatextUsers.ToDictionary(
            user => user.Username,
            user => user.SFUserId
        );

        // Note: The following code is not testable due to ParatextData limitations
        // Iterate over the Paratext commits earlier than the earliest MongoOp
        DateTimeOffset timeStampOffset = new DateTimeOffset(milestonePeriod, TimeSpan.Zero);
        HgRevisionCollection revisionCollection = HgRevisionCollection
            .Get(scrText)
            .FilterRevisions(r => r.CommitTimeStamp <= timeStampOffset);
        int bookNum = Canon.BookIdToNumber(book);
        foreach (HgRevision revision in revisionCollection)
        {
            // Get the revision summary to see if the book and chapter has changed
            RevisionChangeInfo revisionSummary = revisionCollection.GetSummaryFor(revision);

            // Skip the revision if this book is not modified
            if (!revisionSummary.HasChangesInBook(bookNum))
            {
                continue;
            }

            // If this revision modifies this chapter, emit it
            var changesForBook = revisionSummary.GetChangesForBook(bookNum);
            if (changesForBook.ChapterHasChange(chapter))
            {
                paratextUsers.TryGetValue(revision.User, out string? userId);
                yield return new DocumentRevision
                {
                    Source = OpSource.Paratext,
                    Timestamp = revision.CommitTimeStamp.UtcDateTime,
                    UserId = userId,
                };
            }
        }

        // Clean up the scripture text
        scrText.Dispose();
    }

    /// <summary>
    /// Gets a delta from USFM data, utilising the Paratext scripture text underlying it.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="sfProjectId">The SF project identifer.</param>
    /// <param name="usfm">The USFM data.</param>
    /// <param name="bookNum">The book number</param>
    /// <returns>The USFM as a Delta.</returns>
    /// <exception cref="DataNotFoundException">The project or user was not found.</exception>
    public async Task<Delta> GetDeltaFromUsfmAsync(string curUserId, string sfProjectId, string usfm, int bookNum)
    {
        // Load the user secret
        if (!(await _userSecretRepository.TryGetAsync(curUserId)).TryResult(out UserSecret userSecret))
        {
            throw new DataNotFoundException("The user secret cannot be found.");
        }

        // Connect to the realtime server
        await using IConnection connection = await _realtimeService.ConnectAsync(userSecret.Id);

        // Load the project so we can check security and get the Paratext identifier
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(sfProjectId);
        await projectDoc.FetchAsync();
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("Project does not exist.");
        }

        // Load the Paratext project
        using ScrText scrText = GetScrText(userSecret, projectDoc.Data.ParatextId);

        // Get the USFM as a Delta
        return GetDeltaFromUsfm(scrText, bookNum, usfm).Delta;
    }

    protected override void DisposeManagedResources()
    {
        _registryClient.Dispose();
        _httpClientHandler.Dispose();
    }

    /// <summary>
    /// Gets a Delta from USFM data and a <see cref="ScrText"/> object.
    /// </summary>
    /// <param name="scrText">The Paratext scripture text.</param>
    /// <param name="bookNum">The book number</param>
    /// <param name="usfm">The USFM data</param>
    /// <returns>The delta.</returns>
    private ChapterDelta GetDeltaFromUsfm(ScrText scrText, int bookNum, string usfm)
    {
        string usx = UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
        XDocument usxDoc = XDocument.Parse(usx);
        return _deltaUsxMapper.ToChapterDeltas(usxDoc).First();
    }

    private ScrText GetScrText(UserSecret userSecret, string paratextId)
    {
        _ =
            GetParatextUsername(userSecret)
            ?? throw new DataNotFoundException($"Failed to get username for UserSecret id {userSecret.Id}.");
        ScrText? scrText =
            ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId)
            ?? throw new DataNotFoundException(
                $"Could not find project for UserSecret id {userSecret.Id}, PT project id {paratextId}"
            );
        return scrText;
    }

    /// <summary>
    /// Gets the writing system values, based on the <seealso cref="WritingSystemDefinition"/> in <c>libpalaso</c>.
    /// </summary>
    /// <param name="languageTag">The language tag.</param>
    internal static WritingSystem GetWritingSystem(string? languageTag)
    {
        var writingSystem = new WritingSystem { Tag = languageTag };
        if (!string.IsNullOrWhiteSpace(writingSystem.Tag))
        {
            var writingSystemDefinition = new WritingSystemDefinition(writingSystem.Tag);
            writingSystem.Region = writingSystemDefinition.Region?.Code;
            writingSystem.Script = writingSystemDefinition.Script?.Code;
        }

        return writingSystem;
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
    private static string ConvertFromUserRole(UserRoles? role) =>
        role switch
        {
            UserRoles.Administrator => SFProjectRole.Administrator,
            UserRoles.Consultant => SFProjectRole.Consultant,
            UserRoles.TeamMember => SFProjectRole.Translator,
            UserRoles.Observer => SFProjectRole.PTObserver,
            _ => string.Empty,
        };

    /// <summary>
    /// Converts USX as an XDocument to USFM.
    /// </summary>
    /// <param name="scrText">The Paratext scripture text.</param>
    /// <param name="bookNum">The book number.</param>
    /// <param name="usx">The USX XDocument.</param>
    /// <param name="log">The log (optional).</param>
    /// <returns>The USFM.</returns>
    private static string ConvertXDocumentToUsfm(ScrText scrText, int bookNum, XDocument usx, StringBuilder? log = null)
    {
        log?.AppendLine($"Imported XDocument with {usx.Elements().Count()} elements.");
        UsxFragmenter.FindFragments(
            scrText.ScrStylesheet(bookNum),
            usx.CreateNavigator(),
            XPathExpression.Compile("*[false()]"),
            out string usfm,
            scrText.Settings.AllowInvisibleChars
        );
        log?.AppendLine($"Created usfm of {usfm}");

        // Among other things, normalizing the USFM will remove trailing spaces at the end of verses,
        // which may cause some churn. This is similar to running "Standardize whitespace" in Paratext.
        usfm = UsfmToken.NormalizeUsfm(scrText.ScrStylesheet(bookNum), usfm, false, scrText.RightToLeft, scrText);
        log?.AppendLine($"Normalized usfm to {usfm}");
        return usfm;
    }

    /// <summary>
    /// Converts a Paratext language code into a language-country code for the frontend.
    /// </summary>
    /// <param name="languageCode">The Paratext Language code</param>
    /// <returns>The language-country code</returns>
    private static string FixLanguageCode(string languageCode) =>
        languageCode.ToLower() switch
        {
            "zh-hans" => "zh-CN",
            "zh-hant" => "zh-TW",
            "pt" => "pt-PT",
            "" => string.Empty,
            _ => char.ToLower(languageCode[0]) + (languageCode.Length == 1 ? string.Empty : languageCode[1..]),
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
            string path = Path.Combine(
                Paratext.Data.ScrTextCollection.SettingsDirectory,
                "_Backups",
                $"{scrText.Guid}.bndl"
            );
            return _fileSystemService.FileExists(path);
        }
        catch (Exception e)
        {
            // An error occurred
            _logger.LogError(
                e,
                $"Problem when checking if a local PT repo backup exists for scrText id '{scrText.Guid}'."
            );
            return false;
        }
    }

    private IReadOnlyList<ParatextProject> GetProjects(
        UserSecret userSecret,
        IEnumerable<SharedRepository> remotePtProjects,
        IEnumerable<ProjectMetadata> projectsMetadata
    )
    {
        ArgumentNullException.ThrowIfNull(userSecret, nameof(userSecret));

        List<ParatextProject> paratextProjects = [];
        IQueryable<SFProject> existingSfProjects = _realtimeService.QuerySnapshots<SFProject>();

        foreach (SharedRepository remotePtProject in remotePtProjects)
        {
            SFProject correspondingSfProject = existingSfProjects.FirstOrDefault(sfProj =>
                sfProj.ParatextId == remotePtProject.SendReceiveId.Id
            );

            bool sfProjectExists = correspondingSfProject != null;
            bool sfUserIsOnSfProject = correspondingSfProject?.UserRoles.ContainsKey(userSecret.Id) ?? false;
            UserRoles ptUserRole = remotePtProject.SourceUsers.GetRole(GetParatextUsername(userSecret));
            bool adminOnPtProject = ptUserRole == UserRoles.Administrator;
            bool ptProjectIsConnectable =
                (sfProjectExists && !sfUserIsOnSfProject) || (!sfProjectExists && adminOnPtProject);
            bool hasUserRoleChanged =
                sfProjectExists
                && sfUserIsOnSfProject
                && ConvertFromUserRole(ptUserRole) != correspondingSfProject.UserRoles[userSecret.Id];

            // On SF Live server, many users have projects without corresponding project metadata.
            // If this happens, default to using the project's short name
            var projectMD = projectsMetadata.SingleOrDefault(pmd => pmd.ProjectGuid == remotePtProject.SendReceiveId);
            string fullOrShortName = projectMD == null ? remotePtProject.ScrTextName : projectMD.FullName;

            // Get the writing system details
            WritingSystem writingSystem = GetWritingSystem(
                correspondingSfProject?.WritingSystem.Tag ?? projectMD?.LanguageId.Code
            );

            // Determine if drafting is enabled
            bool isBackTranslation =
                correspondingSfProject?.TranslateConfig.ProjectType == ProjectType.BackTranslation.ToString();
            bool preTranslationEnabled = correspondingSfProject?.TranslateConfig.PreTranslate == true;
            bool isDraftingEnabled = isBackTranslation || preTranslationEnabled;

            // Determine if there is a draft
            bool hasDraft =
                isDraftingEnabled
                && correspondingSfProject?.Texts.Any(t => t.Chapters.Any(c => c.HasDraft == true)) == true;

            paratextProjects.Add(
                new ParatextProject
                {
                    ParatextId = remotePtProject.SendReceiveId.Id,
                    Name = fullOrShortName,
                    ShortName = remotePtProject.ScrTextName,
                    LanguageRegion = writingSystem.Region,
                    LanguageScript = writingSystem.Script,
                    LanguageTag = writingSystem.Tag ?? string.Empty,
                    ProjectId = correspondingSfProject?.Id,
                    IsConnectable = ptProjectIsConnectable,
                    IsConnected = sfProjectExists && sfUserIsOnSfProject,
                    IsDraftingEnabled = isDraftingEnabled,
                    HasDraft = hasDraft,
                    HasUserRoleChanged = hasUserRoleChanged,
                }
            );
        }
        return paratextProjects.OrderBy(project => project.Name, StringComparer.InvariantCulture).ToArray();
    }

    private bool TryGetProject(
        UserSecret userSecret,
        SharedRepository sharedRepository,
        IEnumerable<ProjectMetadata> metadata,
        out ParatextProject? ptProject
    )
    {
        if (sharedRepository != null)
        {
            ptProject = GetProjects(userSecret, new SharedRepository[] { sharedRepository }, metadata).FirstOrDefault();
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
    /// <c>true</c> if the specified project is registered, and the user is
    /// authorized to view it; otherwise, <c>false</c>.
    /// </returns>
    internal async Task<bool> IsRegisteredAsync(UserSecret userSecret, string paratextId, CancellationToken token)
    {
        try
        {
            string registeredParatextId = await CallApiAsync(
                userSecret,
                HttpMethod.Get,
                $"projects/{paratextId}/identification_systemId/paratext/text",
                null,
                token
            );
            return registeredParatextId.Trim('"') == paratextId;
        }
        catch (HttpRequestException error) when (error.StatusCode == HttpStatusCode.NotFound)
        {
            // A 404 error means the project is not registered. It can also mean
            // the authenticated user is not authorized to view it, according to
            // the API and as seen in practice.
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
                "Error: Could not find hg executable at {0}. Please install hg 4.7 or greater.",
                customHgPath
            );
            _logger.LogError(msg);
            throw new InvalidOperationException(msg);
        }
        var hgMerge = Path.Combine(AssemblyDirectory, "ParatextMerge.py");
        _hgHelper.SetDefault(new Hg(customHgPath, hgMerge, AssemblyDirectory));
    }

    /// <summary> Copy resource files from the Assembly Directory into the sync directory. </summary>
    private void InstallStyles()
    {
        string[] resources = ["usfm.sty", "revisionStyle.sty", "revisionTemplate.tem", "usfm_mod.sty", "usfm_sb.sty"];
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
    private void EnsureProjectReposExists(
        UserSecret userSecret,
        ParatextProject target,
        IInternetSharedRepositorySource repositorySource
    )
    {
        string username = GetParatextUsername(userSecret);
        using ScrText scrText = ScrTextCollection.FindById(username, target.ParatextId);
        bool targetNeedsCloned = scrText == null;
        if (target is ParatextResource resource)
        {
            // If the target is a resource, install it
            InstallResource(username, resource, target.ParatextId, targetNeedsCloned);
        }
        else if (targetNeedsCloned)
        {
            SharedRepository targetRepo = new SharedRepository(
                target.ShortName,
                HexId.FromStr(target.ParatextId),
                RepositoryType.Shared
            );
            CloneProjectRepo(repositorySource, target.ParatextId, targetRepo);
        }
    }

    /// <summary>
    /// Installs the resource.
    /// </summary>
    /// <param name="username">The username.</param>
    /// <param name="resource">The resource.</param>
    /// <param name="targetParatextId">The target paratext identifier.</param>
    /// <param name="needsToBeCloned">If set to <c>true</c>, the resource needs to be cloned.</param>
    /// <remarks>
    ///   <paramref name="targetParatextId" /> is required because the resource may be a source or target.
    /// </remarks>
    private void InstallResource(
        string username,
        ParatextResource resource,
        string targetParatextId,
        bool needsToBeCloned
    )
    {
        if (resource.InstallableResource != null)
        {
            // Correct the language code for old resources
            LanguageId? overrideLanguageId = null;
            if (DetermineBestLanguageForResource(resource.InstallableResource.ExistingScrText))
            {
                overrideLanguageId = resource.InstallableResource.ExistingScrText?.Settings.LanguageID;
            }

            // Install the resource if it is missing or out of date
            if (
                !resource.IsInstalled
                || resource.AvailableRevision > resource.InstalledRevision
                || resource.InstallableResource.IsNewerThanCurrentlyInstalled()
            )
            {
                resource.InstallableResource.Install();
                needsToBeCloned = true;

                // On first install, we will now have an existing ScrText, so check the language is OK
                if (DetermineBestLanguageForResource(resource.InstallableResource.ExistingScrText))
                {
                    overrideLanguageId = resource.InstallableResource.ExistingScrText?.Settings.LanguageID;
                }
            }

            // Extract the resource to the source directory
            if (needsToBeCloned)
            {
                string path = LocalProjectDir(targetParatextId);
                _fileSystemService.CreateDirectory(path);
                resource.InstallableResource.ExtractToDirectory(path);
                MigrateResourceIfRequired(username, targetParatextId, overrideLanguageId);
            }
        }
        else
        {
            _logger.LogWarning($"The installable resource is not available for {resource.ParatextId}");
        }
    }

    /// <summary>
    /// Determines the best language for a resource project
    /// </summary>
    /// <param name="scrText">The scripture text for the resource.</param>
    /// <returns><c>true</c> if the project language was overridden by the DBL; otherwise, <c>false</c>.</returns>
    /// <remarks>
    /// <para>
    /// This is reimplemented from <c>Paratext.Migration.MigrateLanguage.DetermineBestLangIdToUseForResource()</c>.
    /// </para>
    /// <para>
    /// Because resources are not written to (as they are readonly), this should be run before using the LanguageID.
    /// </para>
    /// </remarks>
    private static bool DetermineBestLanguageForResource(ScrText? scrText)
    {
        // If we do not have a ScrText, or this is not a resource, do not determine the language
        if (scrText is null || !scrText.IsResourceProject)
        {
            return false;
        }

        // Get the language identifier from the .SSF file
        string? languageIdLDML = scrText.Settings.LanguageID?.Id;

        // Get the language identifier embedded in the .P8Z folder structure: .dbl\language\iso
        string languageIdDBL = ((ZippedProjectFileManagerBase)scrText.FileManager).DBLResourceSettings.LanguageIso639_3;
        LanguageId langIdDBL = LanguageId.FromEthnologueCode(languageIdDBL);
        if (string.IsNullOrEmpty(languageIdLDML))
        {
            scrText.Settings.LanguageID = langIdDBL;
            return true;
        }

        LanguageId langIdLDML = LanguageId.FromEthnologueCode(languageIdLDML);
        if (langIdLDML.Code == langIdDBL.Code)
        {
            scrText.Settings.LanguageID = langIdLDML;
            return false;
        }

        scrText.Settings.LanguageID = langIdDBL;
        return true;
    }

    /// <summary>
    /// Migrates a Paratext Resource, if required.
    /// </summary>
    /// <param name="username">The username.</param>
    /// <param name="paratextId">The paratext project identifier.</param>
    /// <param name="overrideLanguage">The language to override, if the project's language is incorrect.</param>
    /// <remarks>This only performs one basic migration. Full migration can only be performed by Paratext.</remarks>
    private void MigrateResourceIfRequired(string username, string paratextId, LanguageId? overrideLanguage)
    {
        // Ensure that we have the ScrText to migrate
        using ScrText scrText = ScrTextCollection.FindById(username, paratextId);
        if (scrText is null)
        {
            return;
        }

        // Migrate the language id if it is missing. It will be missing as the project has changed from a resource (p8z)
        // to a project (directory based), and we did not write to the p8z file as Paratext does in its migrators.
        // The ScrText created above will not have the values defined in DetermineBestLanguageForResource() above, so
        // we will need to override them again before migrating the LDML (an action which requires the LanguageID).
        if (overrideLanguage is not null)
        {
            scrText.Settings.LanguageID = overrideLanguage;

            // This will create Settings.xml with the correct LanguageIsoCode value
            scrText.Settings.Save();
        }

        // Perform a simple migration of the Paratext 7 LDML file to the new Paratext 8+ location.
        // Paratext performs a much more complex migration, but we do not need that level of detail.
        // If the publisher updates this resource, this file will be overwritten with the fully migrated language file,
        // stopping this migration from running in the future and negating its need.
        string path = LocalProjectDir(paratextId);
        string oldLdmlFile = Path.Combine(path, "ldml.xml");
        string newLdmlFile = Path.Combine(path, scrText.Settings.LdmlFileName);
        if (_fileSystemService.FileExists(oldLdmlFile) && !_fileSystemService.FileExists(newLdmlFile))
        {
            _fileSystemService.MoveFile(oldLdmlFile, newLdmlFile);
        }
    }

    /// <summary> Create a shared project object for a given project. </summary>
    private static SharedProject CreateSharedProject(
        string paratextId,
        string proj,
        ScrText scrText,
        SharedRepository sharedRepository
    )
    {
        // Previously we used the CreateSharedProject method of SharingLogic but it would
        // result in null if the user did not have a license to the repo which happens
        // if the project is derived from another. This ensures the SharedProject is available.
        // We must set the ScrText property of the SharedProject to indicate that the project is available locally
        return new SharedProject
        {
            ScrTextName = proj,
            Repository = sharedRepository,
            SendReceiveId = HexId.FromStr(paratextId),
            ScrText = scrText,
            Permissions = scrText.Permissions,
        };
    }

    /// <summary>Path for project directory on local filesystem. Whether or not that directory
    /// exists. </summary>
    private string LocalProjectDir(string paratextId)
    {
        // Historically, SF used both "target" and "source" projects in adjacent directories. Then
        // moved to just using "target".
        string subDirForMainProject = "target";
        return Path.Combine(SyncDir, paratextId, subDirForMainProject);
    }

    private void CloneProjectRepo(IInternetSharedRepositorySource source, string paratextId, SharedRepository repo)
    {
        string clonePath = LocalProjectDir(paratextId);
        if (!_fileSystemService.DirectoryExists(clonePath))
        {
            _fileSystemService.CreateDirectory(clonePath);
            _hgHelper.Init(clonePath);
        }
        source.Pull(clonePath, repo);
        _hgHelper.Update(clonePath);
    }

    private static IEnumerable<CommentThread> GetCommentThreads(CommentManager manager, int? bookNum)
    {
        // We will query the VerseRefStr value, rather than VerseRef to speed up this query
        string verseRefBook = bookNum is not null ? Canon.BookNumberToId(bookNum.Value) + " " : string.Empty;

        // CommentThread.VerseRef calculates the reallocated location, however in Paratext a note can only be
        // reallocated within the chapter, so for our query, we only need the first location.
        // A Biblical Term has a VerseRef, but it is usually not useful, so we exclude BT notes when getting a book's notes
        // The VerseRef will still be stored for a BT note, as this is a PT requirement.
        return manager.FindThreads(
            commentThread =>
                (
                    bookNum != null
                    && commentThread
                        .Comments[0]
                        .VerseRefStr.StartsWith(verseRefBook, StringComparison.OrdinalIgnoreCase)
                    && !commentThread.IsBTNote
                    && !commentThread.Id.StartsWith("ANSWER_")
                ) || (bookNum == null && commentThread.IsBTNote),
            false
        );
    }

    private CommentManager GetCommentManager(UserSecret userSecret, string paratextId)
    {
        ScrText scrText =
            ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId)
            ?? throw new DataNotFoundException(
                "Cannot create comment manager for project with paratextId: " + paratextId
            );
        return CommentManager.Get(scrText);
    }

    private SyncMetricInfo PutCommentThreads(
        UserSecret userSecret,
        string paratextId,
        List<List<Paratext.Data.ProjectComments.Comment>> changeList
    )
    {
        SyncMetricInfo syncMetricInfo = new SyncMetricInfo();
        if (!changeList.Any())
        {
            return syncMetricInfo;
        }

        string username = GetParatextUsername(userSecret);
        List<string> users = [];
        ScrText scrText =
            ScrTextCollection.FindById(username, paratextId)
            ?? throw new DataNotFoundException("Can't get access to cloned project.");
        CommentManager manager = CommentManager.Get(scrText);

        // Algorithm sourced from Paratext DataAccessServer
        foreach (List<Paratext.Data.ProjectComments.Comment> thread in changeList)
        {
            CommentThread? existingThread = manager.FindThread(thread[0].Thread);
            foreach (Paratext.Data.ProjectComments.Comment comment in thread)
            {
                Paratext.Data.ProjectComments.Comment existingComment = existingThread?.Comments.FirstOrDefault(c =>
                    c.Id == comment.Id
                );
                if (existingComment == null)
                {
                    manager.AddComment(comment);
                    syncMetricInfo.Added++;
                }
                else if (comment.Deleted)
                {
                    // Permanently remove the comment
                    manager.RemoveComment(comment);
                    syncMetricInfo.Deleted++;
                }
                else
                {
                    existingComment.ExternalUser = comment.ExternalUser;
                    existingComment.Contents = comment.Contents;
                    existingComment.VersionNumber += 1;
                    existingComment.Deleted = false;
                    existingComment.TagsAdded = comment.TagsAdded;
                    syncMetricInfo.Updated++;
                }

                if (!users.Contains(comment.User))
                    users.Add(comment.User);
            }
        }

        try
        {
            foreach (string user in users)
                WriteCommentXml(manager, user);
            _paratextDataHelper.CommitVersionedText(
                scrText,
                $"{syncMetricInfo.Added} notes added and "
                    + $"{syncMetricInfo.Deleted + syncMetricInfo.Updated} notes updated or deleted in synchronize"
            );
            _logger.LogInformation(
                "{0} added {1} notes, updated {2} notes and deleted {3} notes",
                userSecret.Id,
                syncMetricInfo.Added,
                syncMetricInfo.Updated,
                syncMetricInfo.Deleted
            );
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Exception while updating notes: {0}", e.Message);
        }

        return syncMetricInfo;
    }

    private void WriteCommentXml(CommentManager commentManager, string username)
    {
        CommentList userComments = [.. commentManager.AllComments.Where(comment => comment.User == username)];
        string fileName = commentManager.GetUserFileName(username);
        string path = Path.Combine(commentManager.ScrText.Directory, fileName);
        using Stream stream = _fileSystemService.CreateFile(path);
        _fileSystemService.WriteXmlFile(stream, userComments);
    }

    private CommentTags? GetCommentTags(UserSecret userSecret, string paratextId)
    {
        string? ptUsername = GetParatextUsername(userSecret);
        if (ptUsername == null)
            return null;
        ScrText? scrText = ScrTextCollection.FindById(ptUsername, paratextId);
        return scrText == null ? null : CommentTags.Get(scrText);
    }

    private async Task<string> CallApiAsync(
        UserSecret userSecret,
        HttpMethod method,
        string url,
        string? content = null,
        CancellationToken token = default
    )
    {
        userSecret = await GetUserSecretWithCurrentParatextTokens(userSecret.Id, token);
        using var request = new HttpRequestMessage(method, $"api8/{url}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userSecret.ParatextTokens.AccessToken);
        if (content != null)
        {
            request.Content = new StringContent(content);
        }
        HttpResponseMessage response = await _registryClient.SendAsync(request, token);
        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadAsStringAsync(token);
        }
        else
        {
            throw new HttpRequestException(
                await ExceptionHandler.CreateHttpRequestErrorMessage(response),
                null,
                response.StatusCode
            );
        }
    }

    /// <summary>
    /// Get access to a source for PT project repositories, based on user secret.
    /// </summary>
    private async Task<IInternetSharedRepositorySource> GetInternetSharedRepositorySource(
        string sfUserId,
        CancellationToken token
    )
    {
        UserSecret userSecret = await GetUserSecretWithCurrentParatextTokens(sfUserId, token);
        return _internetSharedRepositorySourceProvider.GetSource(userSecret, _sendReceiveServerUri, _registryServerUri);
    }

    /// <summary>
    /// Get Paratext resources that a user has access to.
    /// </summary>
    /// <param name="sfUserId">The Scripture Forge user identifier.</param>
    /// <param name="includeInstallableResource">If set to <c>true</c> include the installable resource.</param>
    /// <param name="token">The cancellation token.</param>
    /// <returns>
    /// The available resources.
    /// </returns>
    private async Task<IReadOnlyList<ParatextResource>> GetResourcesInternalAsync(
        string sfUserId,
        bool includeInstallableResource,
        CancellationToken token
    )
    {
        UserSecret userSecret = await GetUserSecretWithCurrentParatextTokens(sfUserId, token);
        IEnumerable<SFInstallableDblResource> resources = SFInstallableDblResource.GetInstallableDblResources(
            userSecret,
            _paratextOptions.Value,
            _restClientFactory,
            _fileSystemService,
            _jwtTokenHelper,
            ScrTextCollection,
            _exceptionHandler,
            _dblServerUri
        );
        IReadOnlyDictionary<string, int> resourceRevisions = SFInstallableDblResource.GetInstalledResourceRevisions();
        return resources
            .OrderBy(r => r.FullName)
            .Select(r =>
            {
                // Get the writing system details
                WritingSystem writingSystem = GetWritingSystem(r.LanguageID.Code);

                // Return the resource details
                return new ParatextResource
                {
                    AvailableRevision = r.DBLRevision,
                    CreatedTimestamp = r.CreatedTimestamp,
                    InstallableResource = includeInstallableResource ? r : null,
                    InstalledRevision = resourceRevisions.TryGetValue(r.DBLEntryUid.Id, out int revision)
                        ? revision
                        : 0,
                    IsConnectable = false,
                    IsConnected = false,
                    IsDraftingEnabled = false,
                    IsInstalled = resourceRevisions.ContainsKey(r.DBLEntryUid.Id),
                    LanguageRegion = writingSystem.Region,
                    LanguageScript = writingSystem.Script,
                    LanguageTag = writingSystem.Tag ?? string.Empty,
                    ManifestChecksum = r.ManifestChecksum,
                    Name = r.FullName,
                    ParatextId = r.DBLEntryUid.Id,
                    PermissionsChecksum = r.PermissionsChecksum,
                    ProjectId = null,
                    ShortName = r.Name,
                };
            })
            .ToArray();
    }

    /// <summary> Get the corresponding Comment from a note. </summary>
    private static Paratext.Data.ProjectComments.Comment? GetMatchingCommentFromNote(
        Note note,
        CommentThread thread,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        ParatextUserProfile ptUser =
            note.SyncUserRef == null
                ? null
                : ptProjectUsers.Values.SingleOrDefault(u => u.OpaqueUserId == note.SyncUserRef);
        if (ptUser == null)
            return null;
        string date = new DateTimeOffset(note.DateCreated).ToString("o");
        // Comment ids are generated using the Paratext username. Since we do not want to transparently
        // store a username to a note in SF we construct the intended Comment id at runtime.
        string commentId = string.Format("{0}/{1}/{2}", note.ThreadId, ptUser.Username, date);
        Paratext.Data.ProjectComments.Comment matchingComment = thread.Comments.LastOrDefault(c => c.Id == commentId);
        if (matchingComment != null)
            return matchingComment;

        // Try another method to find the comment
        DateTime noteTime = note.DateCreated.ToUniversalTime();
        return thread
            .Comments.Where(c =>
                DateTime.Equals(noteTime, DateTime.Parse(c.Date, null, DateTimeStyles.AdjustToUniversal))
            )
            .LastOrDefault(c => c.User == ptUser.Username);
    }

    /// <summary>
    /// Get the comment change lists from the up-to-date note thread docs in the Scripture Forge mongo database.
    /// </summary>
    private async Task<List<List<Paratext.Data.ProjectComments.Comment>>> SFNotesToCommentChangeListAsync(
        IEnumerable<IDocument<NoteThread>> noteThreadDocs,
        CommentManager commentManager,
        string defaultUsername,
        int sfNoteTagId,
        IReadOnlyDictionary<string, string> displayNames,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        List<List<Paratext.Data.ProjectComments.Comment>> changes = [];
        IEnumerable<IDocument<NoteThread>> activeThreadDocs = noteThreadDocs.Where(t => t.Data != null);
        foreach (IDocument<NoteThread> threadDoc in activeThreadDocs)
        {
            List<Paratext.Data.ProjectComments.Comment> thread = [];
            CommentThread? existingThread = commentManager.FindThread(threadDoc.Data.ThreadId);
            List<(int, string)> threadNoteParatextUserRefs = [];
            for (int i = 0; i < threadDoc.Data.Notes.Count; i++)
            {
                Note note = threadDoc.Data.Notes[i];

                // Do not update a note if it is not editable
                if (note.Editable != true)
                {
                    continue;
                }

                Paratext.Data.ProjectComments.Comment matchedComment =
                    existingThread == null ? null : GetMatchingCommentFromNote(note, existingThread, ptProjectUsers);
                if (matchedComment != null)
                {
                    var comment = (Paratext.Data.ProjectComments.Comment)matchedComment.Clone();

                    // We can only update a note if the comment and note have the same version number.
                    // Or if the note is authored by a commenter, set the comment content to be the SF note content
                    bool isCommenterNote =
                        ptProjectUsers.Values.SingleOrDefault(p => p.SFUserId == note.OwnerRef) == null;
                    if (note.VersionNumber == comment.VersionNumber || isCommenterNote)
                    {
                        bool commentUpdated = false;
                        if (note.Editable == true && note.Deleted && !comment.Deleted)
                        {
                            comment.Deleted = true;
                            commentUpdated = true;
                        }
                        else if (
                            GetUpdatedCommentXmlIfChanged(comment, note, displayNames, ptProjectUsers, out string xml)
                        )
                        {
                            try
                            {
                                // Since PTX-23738 we must create the contents node,
                                // as the setter for Contents reads and stores the OuterXml
                                XmlElement contentsElement = comment.GetOrCreateCommentNode();
                                contentsElement.InnerXml = xml;
                                comment.Contents = contentsElement;
                                comment.VersionNumber++;
                                commentUpdated = true;
                            }
                            catch (XmlException)
                            {
                                // FIXME Properly handle characters that need to be escaped instead of just logging an error
                                _logger.LogError($"Could not update comment xml for note {note.DataId}.\n{xml}");
                            }
                        }

                        if (commentUpdated)
                            thread.Add(comment);
                    }
                }
                else
                {
                    if (note.Deleted)
                        continue;
                    if (!string.IsNullOrEmpty(note.SyncUserRef))
                        throw new DataNotFoundException(
                            $"Could not find the matching comment for note {note.DataId} in thread {note.ThreadId} containing sync user {note.SyncUserRef}."
                        );

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
                        ContextAfter = threadDoc.Data.OriginalContextAfter,
                        BiblicalTermId = threadDoc.Data.BiblicalTermId,
                        ExtraHeadingInfo = threadDoc.Data.ExtraHeadingInfo switch
                        {
                            null => null,
                            _ => new TermNoteHeadingInfo(
                                threadDoc.Data.ExtraHeadingInfo.Lemma,
                                threadDoc.Data.ExtraHeadingInfo.Language,
                                threadDoc.Data.ExtraHeadingInfo.Transliteration,
                                threadDoc.Data.ExtraHeadingInfo.Gloss
                            ),
                        },
                    };

                    bool isFirstComment = i == 0;
                    PopulateCommentFromNote(note, comment, displayNames, ptProjectUsers, sfNoteTagId, isFirstComment);
                    thread.Add(comment);
                    if (note.SyncUserRef == null)
                        threadNoteParatextUserRefs.Add((i, ptProjectUser.OpaqueUserId));
                }
            }

            if (thread.Count > 0)
            {
                changes.Add(thread);
                // Set the sync user ref on the notes in the SF Mongo DB
                await UpdateNoteSyncUserAsync(threadDoc, threadNoteParatextUserRefs);
            }
        }
        return changes;
    }

    /// <summary>
    /// Compares the content of a PT comment to the equivalent note and returns the
    /// change type if the note needs to be updated.
    /// </summary>
    /// <remarks> If the external user property of a comment is set, the comment changes are disregarded. </remarks>
    private ChangeType GetCommentChangeType(
        Paratext.Data.ProjectComments.Comment comment,
        Note note,
        CommentTag? commentTag,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        // If the external user property is set, discard changes made in PT
        if (!string.IsNullOrEmpty(comment.ExternalUser))
            return ChangeType.None;
        if (comment.Deleted != note.Deleted)
            return ChangeType.Deleted;
        // Check if fields have been updated in Paratext
        bool statusChanged = comment.Status.InternalValue != note.Status;
        bool typeChanged = comment.Type.InternalValue != note.Type;
        bool conflictTypeChanged = comment.ConflictType.InternalValue != note.ConflictType;
        bool acceptedChangeXmlChanged = comment.AcceptedChangeXmlStr != note.AcceptedChangeXml;
        string equivalentNoteContent = GetNoteContentFromComment(comment);
        bool contentChanged = GetUpdatedContentIfChanged(note.Content, equivalentNoteContent) != null;
        bool tagChanged = commentTag?.Id != note.TagId;
        bool assignedUserChanged = GetAssignedUserRef(comment.AssignedUser, ptProjectUsers) != note.Assignment;
        bool versionNumberChanged = (note.VersionNumber ?? 0) != comment.VersionNumber;
        if (
            contentChanged
            || statusChanged
            || tagChanged
            || typeChanged
            || conflictTypeChanged
            || assignedUserChanged
            || acceptedChangeXmlChanged
            || versionNumberChanged
        )
            return ChangeType.Updated;
        return ChangeType.None;
    }

    private bool GetUpdatedCommentXmlIfChanged(
        Paratext.Data.ProjectComments.Comment comment,
        Note note,
        IReadOnlyDictionary<string, string> displayNames,
        Dictionary<string, ParatextUserProfile> ptProjectUsers,
        out string xml
    )
    {
        string equivalentCommentContent =
            GetCommentContentsFromNote(note, displayNames, ptProjectUsers) ?? string.Empty;
        string contents = comment.Contents?.InnerXml ?? string.Empty;
        string updatedContent = GetUpdatedContentIfChanged(contents, equivalentCommentContent);
        if (updatedContent is not null)
        {
            xml = updatedContent;
            return true;
        }
        xml = string.Empty;
        return false;
    }

    /// <summary>
    /// Convert the note content to its comment equivalent. The primary use case
    /// is to add the SF user label to the content.
    /// </summary>
    private string? GetCommentContentsFromNote(
        Note note,
        IReadOnlyDictionary<string, string> displayNames,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        if (note.Content == null)
            return null;
        string ownerId = note.OwnerRef;
        // if the user is a paratext user, keep the note content as is
        if (
            ptProjectUsers.Values.SingleOrDefault(u => u.SFUserId == ownerId) != null
            || !displayNames.TryGetValue(ownerId, out string displayName)
        )
            return note.Content;

        var contentElem = new XElement("Contents");
        string label = $"[{displayName} - {_siteOptions.Value.Name}]";
        var labelElement = new XElement("p", label, new XAttribute("sf-user-label", "true"));
        contentElem.Add(labelElement);

        XDocument commentDoc = XDocument.Parse($"<root>{note.Content}</root>");
        if (!note.Content.StartsWith("<p>"))
        {
            // add the note content in a paragraph tag
            XElement paragraph = new XElement("p");
            paragraph.Add(commentDoc.Root.Nodes());
            contentElem.Add(paragraph);
        }
        else
        {
            // add the note content paragraph by paragraph
            foreach (XElement paragraphElems in commentDoc.Root.Descendants("p"))
                contentElem.Add(paragraphElems);
        }

        StringBuilder sb = new StringBuilder();
        foreach (XElement paragraphElems in contentElem.Descendants("p"))
            sb.Append(paragraphElems);
        return sb.ToString();
    }

    /// <summary>
    /// Convert the content from a comment to its note equivalent. The primary use case
    /// is to remove the SF user label from the comment.
    /// </summary>
    private static string GetNoteContentFromComment(Paratext.Data.ProjectComments.Comment comment)
    {
        string content = comment.Contents?.OuterXml;
        if (string.IsNullOrEmpty(content))
            return content;
        XDocument doc = XDocument.Parse(content);
        XElement contentNode = (XElement)doc.FirstNode;
        XNode[] nodes = [.. contentNode.Nodes()];
        if (!nodes.Any())
            return string.Empty;

        int paragraphNodeCount = ((XElement)doc.FirstNode).Elements("p").Count();
        StringBuilder sb = new StringBuilder();
        bool isReviewer = false;
        for (int i = 0; i < nodes.Length; i++)
        {
            XNode node = nodes[i];
            if (node.NodeType == XmlNodeType.Text)
            {
                // append text to the content string
                sb.Append(node);
                continue;
            }
            else if (node.NodeType != XmlNodeType.Element)
            {
                // we only know to handle strings and elements
                continue;
            }

            XElement element = (XElement)node;
            // check if the paragraph element contains the user label class
            if (element.Attribute("sf-user-label")?.Value == "true")
                isReviewer = true;
            if (i == 0 && isReviewer)
                continue;
            // If there is only one paragraph node other than the SF user label then omit the paragraph tags
            if (isReviewer && paragraphNodeCount <= 2)
                sb.AppendJoin(string.Empty, element.Nodes());
            else
                sb.Append(node);
        }
        return sb.ToString();
    }

    /// <summary>
    /// Compares the xml contents and return the string representation of the other xml content if changed.
    /// </summary>
    /// <returns> The other xml content if changed; otherwise, <c>null</c>. </returns>
    private static string? GetUpdatedContentIfChanged(string currentXml, string otherXml)
    {
        if (string.IsNullOrEmpty(currentXml))
        {
            if (string.IsNullOrEmpty(otherXml))
                return null;
            return otherXml;
        }
        if (string.IsNullOrEmpty(otherXml))
        {
            // return the empty string to indicate that the updated content should be empty
            return string.Empty;
        }

        string xmlWithRoot = $"<root>{currentXml}</root>";
        string otherXmlWithRoot = $"<root>{otherXml}</root>";
        XDocument doc = XDocument.Parse(xmlWithRoot);
        XDocument docOther = XDocument.Parse(otherXmlWithRoot);

        if (XNode.DeepEquals(doc, docOther))
            return null;
        return otherXml;
    }

    private void PopulateCommentFromNote(
        Note note,
        Paratext.Data.ProjectComments.Comment comment,
        IReadOnlyDictionary<string, string> displayNames,
        Dictionary<string, ParatextUserProfile> ptProjectUsers,
        int sfNoteTagId,
        bool isFirstComment
    )
    {
        comment.Thread = note.ThreadId;
        comment.Date = new DateTimeOffset(note.DateCreated).ToString("o");
        comment.Deleted = note.Deleted;

        if (!string.IsNullOrEmpty(note.Content))
        {
            // Since PTX-23738 we must create the contents node,
            // as the setter for Contents reads and stores the OuterXml
            XmlElement contentsElement = comment.GetOrCreateCommentNode();
            contentsElement.InnerXml = GetCommentContentsFromNote(note, displayNames, ptProjectUsers) ?? string.Empty;
            comment.Contents = contentsElement;
        }

        if (!_userSecretRepository.Query().Any(u => u.Id == note.OwnerRef))
            comment.ExternalUser = note.OwnerRef;
        comment.TagsAdded =
            note.TagId == null
                ? isFirstComment
                    ? [sfNoteTagId.ToString()]
                    : null
                : [note.TagId.ToString()];
        comment.VersionNumber = note.VersionNumber ?? 1;

        if (note.Status == NoteStatus.Todo.InternalValue)
        {
            comment.Status = NoteStatus.Todo;
        }
        else if (note.Status == NoteStatus.Resolved.InternalValue)
        {
            comment.Status = NoteStatus.Resolved;
        }
        else if (note.Status == NoteStatus.Done.InternalValue)
        {
            comment.Status = NoteStatus.Done;
        }
        else
        {
            comment.Status = NoteStatus.Unspecified;
        }
    }

    private Note CreateNoteFromComment(
        string noteId,
        Paratext.Data.ProjectComments.Comment comment,
        CommentTag commentTag,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        string noteContent = GetNoteContentFromComment(comment);
        return new Note
        {
            DataId = noteId,
            ThreadId = comment.Thread,
            Type = comment.Type.InternalValue,
            ConflictType = comment.ConflictType.InternalValue,
            // The owner is unknown at this point and is determined when submitting the ops to the note thread docs
            OwnerRef = "",
            SyncUserRef = FindOrCreateParatextUser(comment.User, ptProjectUsers)?.OpaqueUserId,
            Content = noteContent,
            AcceptedChangeXml = comment.AcceptedChangeXmlStr,
            DateCreated = DateTime.Parse(comment.Date),
            DateModified = DateTime.Parse(comment.Date),
            Deleted = comment.Deleted,
            Status = comment.Status.InternalValue,
            TagId = commentTag?.Id,
            Reattached = comment.Reattached,
            Assignment = GetAssignedUserRef(comment.AssignedUser, ptProjectUsers),
            VersionNumber = comment.VersionNumber,
        };
    }

    private string GetAssignedUserRef(string assignedPTUser, Dictionary<string, ParatextUserProfile> ptProjectUsers)
    {
        return assignedPTUser switch
        {
            CommentThread.teamUser or CommentThread.unassignedUser or null => assignedPTUser,
            _ => FindOrCreateParatextUser(assignedPTUser, ptProjectUsers).OpaqueUserId,
        };
    }

    private static CommentTag? GetCommentTag(
        CommentThread thread,
        Paratext.Data.ProjectComments.Comment? comment,
        CommentTags commentTags
    )
    {
        // Use the main to do tag as default
        CommentTag tagInUse = commentTags.Get(CommentTag.toDoTagId);
        CommentTag lastTodoTagUsed = null;
        foreach (Paratext.Data.ProjectComments.Comment threadComment in thread.Comments)
        {
            bool tagAddedInUse = threadComment.TagsAdded is { Length: > 0 };
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
                if (
                    lastTodoTagUsed != null
                    && lastTodoTagUsed.Icon == tagInUse.Icon
                    && (comment.Status == NoteStatus.Todo || tagAddedInUse)
                )
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

    private static string GetVerseText(Delta delta, VerseRef verseRef)
    {
        string vref = string.IsNullOrEmpty(verseRef.Verse) ? verseRef.VerseNum.ToString() : verseRef.Verse;
        return delta.TryConcatenateInserts(out string verseText, vref, DeltaUsxMapper.CanParaContainVerseText)
            ? verseText
            : string.Empty;
    }

    private static TextAnchor GetThreadTextAnchor(CommentThread thread, Dictionary<int, ChapterDelta> chapterDeltas)
    {
        Paratext.Data.ProjectComments.Comment comment =
            thread.Comments.LastOrDefault(c => c.Reattached != null) ?? thread.Comments[0];
        VerseRef verseRef = comment.VerseRef;
        int startPos = comment.StartPosition;
        string selectedText = comment.SelectedText;
        string contextBefore = comment.ContextBefore;
        string contextAfter = comment.ContextAfter;
        if (comment.ReattachedLocation is not null)
        {
            verseRef = comment.ReattachedLocation.VerseRef;
            selectedText = comment.ReattachedLocation.SelectedText;
            startPos = comment.ReattachedLocation.StartPosition;
            contextBefore = comment.ReattachedLocation.ContextBefore;
            contextAfter = comment.ReattachedLocation.ContextAfter;
        }

        if (!chapterDeltas.TryGetValue(verseRef.ChapterNum, out ChapterDelta chapterDelta) || startPos == 0)
            return new TextAnchor();

        string verseText = GetVerseText(chapterDelta.Delta, verseRef);
        verseText = verseText.Replace("\n", "\0");
        PtxUtils.StringUtils.MatchContexts(
            verseText,
            contextBefore,
            selectedText,
            contextAfter,
            null,
            ref startPos,
            out int posJustPastLastCharacter
        );
        // The text anchor is relative to the text in the verse
        return new TextAnchor { Start = startPos, Length = posJustPastLastCharacter - startPos };
    }

    /// <summary>
    /// Finds the Paratext user profile on the project based on the username, if it exists.
    /// If the Paratext user profile does not exist because the user has not logged into SF, create
    /// a profile for that user.
    /// </summary>
    private ParatextUserProfile FindOrCreateParatextUser(
        string paratextUsername,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        if (string.IsNullOrEmpty(paratextUsername))
            return null;
        if (!ptProjectUsers.TryGetValue(paratextUsername, out ParatextUserProfile ptProjectUser))
        {
            ptProjectUser = new ParatextUserProfile
            {
                OpaqueUserId = _guidService.NewObjectId(),
                Username = paratextUsername,
            };
            ptProjectUsers.Add(paratextUsername, ptProjectUser);
        }
        return ptProjectUser;
    }

    private static async Task UpdateNoteSyncUserAsync(
        IDocument<NoteThread> noteThreadDoc,
        List<(int, string)> paratextUserByNoteIndex
    )
    {
        await noteThreadDoc.SubmitJson0OpAsync(op =>
        {
            foreach ((int index, string syncuser) in paratextUserByNoteIndex)
                op.Set(t => t.Notes[index].SyncUserRef, syncuser);
        });
    }

    // Make sure there are no asynchronous methods called after this until the progress is completed.
    private static void StartProgressReporting(IProgress<ProgressState>? progress)
    {
        if (progress == null)
            return;
        var progressDisplay = new SyncProgressDisplay(progress);
        PtxUtils.Progress.Progress.Mgr.SetDisplay(progressDisplay);
    }

    private async Task<UserSecret> GetUserSecretWithCurrentParatextTokens(string sfUserId, CancellationToken token)
    {
        SemaphoreSlim semaphore = _tokenRefreshSemaphores.GetOrAdd(sfUserId, _ => new SemaphoreSlim(1, 1));
        await semaphore.WaitAsync(token);
        try
        {
            Attempt<UserSecret> attempt = await _userSecretRepository.TryGetAsync(sfUserId);
            if (!attempt.TryResult(out UserSecret userSecret))
            {
                throw new DataNotFoundException("Could not find user secrets for SF user id " + sfUserId);
            }

            if (!userSecret.ParatextTokens.ValidateLifetime())
            {
                Tokens refreshedUserTokens;
                try
                {
                    refreshedUserTokens = await _jwtTokenHelper.RefreshAccessTokenAsync(
                        _paratextOptions.Value,
                        userSecret.ParatextTokens,
                        _registryClient,
                        token
                    );
                }
                catch
                {
                    _logger.LogWarning(
                        $"ParatextService.GetUserSecretWithCurrentParatextTokens for sfUserId {sfUserId} is throwing "
                            + $"from call RefreshAccessTokenAsync(). The current access token has issuedAt time "
                            + $"of {userSecret.ParatextTokens.IssuedAt:o}."
                    );

                    // Get the tokens from auth0, and make sure they are up-to-date
                    // If they cannot be refreshed, an exception will throw
                    Attempt<User> userAttempt = await _realtimeService.TryGetSnapshotAsync<User>(sfUserId);
                    if (!userAttempt.TryResult(out User user))
                    {
                        throw;
                    }

                    refreshedUserTokens = await _authService.GetParatextTokensAsync(user.AuthId, token);
                    if (string.IsNullOrWhiteSpace(refreshedUserTokens?.RefreshToken))
                    {
                        throw;
                    }

                    refreshedUserTokens = await _jwtTokenHelper.RefreshAccessTokenAsync(
                        _paratextOptions.Value,
                        refreshedUserTokens,
                        _registryClient,
                        token
                    );
                }

                userSecret = await _userSecretRepository.UpdateAsync(
                    sfUserId,
                    b => b.Set(u => u.ParatextTokens, refreshedUserTokens)
                );
            }

            return userSecret;
        }
        finally
        {
            semaphore.Release();
        }
    }

    /// <summary>
    /// Writes the chapter to the <see cref="ScrText" />.
    /// </summary>
    /// <param name="scrText">The Scripture Text from Paratext.</param>
    /// <param name="userId">The user identifier for the author.</param>
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
            scrText.Permissions.RunWithEditPermision(
                bookNum,
                () => scrText.PutText(bookNum, chapterNum, false, usfm, null)
            );
        }
        else
        {
            scrText.PutText(bookNum, chapterNum, false, usfm, null);
        }

        if (chapterNum == 0)
        {
            _logger.LogInformation(
                "{0} updated {1} in {2}.",
                userId,
                Canon.BookNumberToEnglishName(bookNum),
                scrText.Name
            );
        }
        else
        {
            _logger.LogInformation(
                "{0} updated chapter {1} of {2} in {3}.",
                userId,
                chapterNum,
                Canon.BookNumberToEnglishName(bookNum),
                scrText.Name
            );
        }
    }
}
