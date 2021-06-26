using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
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
        private string _dblServerUri = "https://paratext.thedigitalbiblelibrary.org/";
        private string _registryServerUri = "https://registry.paratext.org";
        private string _sendReceiveServerUri = InternetAccess.uriProduction;
        private readonly IInternetSharedRepositorySourceProvider _internetSharedRepositorySourceProvider;
        private readonly ISFRestClientFactory _restClientFactory;
        /// <summary> Map user IDs to semaphores </summary>
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _tokenRefreshSemaphores = new ConcurrentDictionary<string, SemaphoreSlim>();
        private readonly IHgWrapper _hgHelper;

        public ParatextService(IWebHostEnvironment env, IOptions<ParatextOptions> paratextOptions,
            IRepository<UserSecret> userSecretRepository, IRealtimeService realtimeService,
            IExceptionHandler exceptionHandler, IOptions<SiteOptions> siteOptions, IFileSystemService fileSystemService,
            ILogger<ParatextService> logger, IJwtTokenHelper jwtTokenHelper, IParatextDataHelper paratextDataHelper,
            IInternetSharedRepositorySourceProvider internetSharedRepositorySourceProvider,
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
            _restClientFactory = restClientFactory;
            _hgHelper = hgWrapper;

            _httpClientHandler = new HttpClientHandler();
            _registryClient = new HttpClient(_httpClientHandler);
            if (env.IsDevelopment() || env.IsEnvironment("DevelopmentBeta") || env.IsEnvironment("Testing") || env.IsEnvironment("TestingBeta"))
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

        ///< summary> Path to cloned PT project Mercurial repos. </summary>
        public string SyncDir { get; set; }

        internal IScrTextCollection ScrTextCollection { get; set; }
        internal ISharingLogicWrapper SharingLogicWrapper { get; set; }

        /// <summary> Prepare access to Paratext.Data library, authenticate, and prepare Mercurial. </summary>
        public void Init()
        {
            // Uncomment to output more info from ParatextData.dll for investigating.
            // Trace.Listeners.Add(new TextWriterTraceListener(Console.Out));
            // Trace.AutoFlush = true;

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
            IEnumerable<SharedRepository> repositories = source.GetRepositories();
            IEnumerable<ProjectMetadata> projectsMetadata = source.GetProjectsMetaData();
            IEnumerable<string> projectGuids = projectsMetadata.Select(pmd => pmd.ProjectGuid.Id);
            Dictionary<string, ParatextProject> ptProjectsAvailable =
                GetProjects(userSecret, repositories, projectsMetadata).ToDictionary(ptProject => ptProject.ParatextId);
            if (!projectGuids.Contains(paratextId))
            {
                // See if this is a resource
                IReadOnlyList<ParatextResource> resources =
                    await this.GetResourcesInternalAsync(userSecret.Id, true, token);
                ParatextResource resource = resources.SingleOrDefault(r => r.ParatextId == paratextId);
                if (resource != null)
                {
                    ptProjectsAvailable.Add(resource.ParatextId, resource);
                }
                else
                {
                    _logger.LogWarning($"The project with PT ID {paratextId} did not have a full name available.");
                }
            }
            if (!ptProjectsAvailable.TryGetValue(paratextId, out ParatextProject ptProject))
            {
                throw new ArgumentException(
                    $"PT projects with the following PT ids were requested but without access or they don't exist: {paratextId}");
            }

            EnsureProjectReposExists(userSecret, ptProject, source);
            StartProgressReporting(progress);
            if (!(ptProject is ParatextResource))
            {
                SharedProject sharedProj = SharingLogicWrapper.CreateSharedProject(paratextId,
                    ptProject.ShortName, source.AsInternetSharedRepositorySource(), repositories);
                string username = GetParatextUsername(userSecret);
                // Specifically set the ScrText property of the SharedProject to indicate the project is available locally
                using ScrText scrText = ScrTextCollection.FindById(username, paratextId);
                sharedProj.ScrText = scrText;
                sharedProj.Permissions = sharedProj.ScrText.Permissions;
                List<SharedProject> sharedPtProjectsToSr = new List<SharedProject> { sharedProj };

                // TODO report results
                List<SendReceiveResult> results = Enumerable.Empty<SendReceiveResult>().ToList();
                bool success = false;
                bool noErrors = SharingLogicWrapper.HandleErrors(() => success = SharingLogicWrapper
                    .ShareChanges(sharedPtProjectsToSr, source.AsInternetSharedRepositorySource(),
                    out results, sharedPtProjectsToSr));
                if (!noErrors || !success)
                    throw new InvalidOperationException(
                        "Failed: Errors occurred while performing the sync with the Paratext Server.");
            }
        }

        /// <summary> Get Paratext projects that a user has access to. </summary>
        public async Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret)
        {
            IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(userSecret.Id,
                CancellationToken.None);
            List<SharedRepository> remotePtProjects = ptRepoSource.GetRepositories().ToList();
            List<ProjectMetadata> projectMetadata = ptRepoSource.GetProjectsMetaData().ToList();

            // Omit projects that are not in the PT Registry until we support connecting to such projects.
            remotePtProjects.RemoveAll((SharedRepository project) =>
                !projectMetadata.Any((ProjectMetadata metadata) => metadata.ProjectGuid == project.SendReceiveId));
            return GetProjects(userSecret, remotePtProjects, projectMetadata);
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
            if (userSecret.ParatextTokens == null)
                return Attempt.Failure((string)null);
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

        /// <summary>
        /// Queries the ParatextRegistry for the project and builds a dictionary of SF user id
        /// to paratext user names for members of the project.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="paratextId">The project ParatextId.</param>
        /// <returns>
        /// A dictionary where the key is the SF user ID and the value is Paratext username. (May be empty)
        /// </returns>
        public async Task<IReadOnlyDictionary<string, string>> GetParatextUsernameMappingAsync(UserSecret userSecret,
            string paratextId, CancellationToken token)
        {
            // Skip all the work if the project is a resource. Resources don't have project members
            if (IsResource(paratextId))
            {
                return new Dictionary<string, string>();
            }

            // Get the mapping for paratext users ids to usernames from the registry
            string response = await CallApiAsync(userSecret, HttpMethod.Get,
                $"projects/{paratextId}/members", null, token);
            Dictionary<string, string> paratextMapping = JArray.Parse(response).OfType<JObject>()
                .Where(m => !string.IsNullOrEmpty((string)m["userId"])
                    && !string.IsNullOrEmpty((string)m["username"]))
                .ToDictionary(m => (string)m["userId"], m => (string)m["username"]);

            // Get the mapping of Scripture Forge user IDs to Paratext usernames
            return await this._realtimeService.QuerySnapshots<User>()
                    .Where(u => paratextMapping.Keys.Contains(u.ParatextId))
                    .ToDictionaryAsync(u => u.Id, u => paratextMapping[u.ParatextId]);
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

        public async Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(UserSecret userSecret,
            string paratextId, CancellationToken token)
        {
            if (IsResource(paratextId))
            {
                // Resources do not have roles
                return new Dictionary<string, string>();
            }
            else
            {
                // Paratext RegistryServer has methods to do this, but it is unreliable to use it in a multi-user
                // environment so instead we call the registry API.
                string response = await CallApiAsync(userSecret, HttpMethod.Get,
                    $"projects/{paratextId}/members", null, token);
                var members = JArray.Parse(response);
                return members.OfType<JObject>()
                    .Where(m => !string.IsNullOrEmpty((string)m["userId"]) && !string.IsNullOrEmpty((string)m["role"]))
                    .ToDictionary(m => (string)m["userId"], m => (string)m["role"]);
            }
        }

        /// <summary> Determine if a specific project is in a right to left language. </summary>
        public bool IsProjectLanguageRightToLeft(UserSecret userSecret, string paratextId)
        {
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);
            return scrText == null ? false : scrText.RightToLeft;
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
        public async Task PutBookText(UserSecret userSecret, string projectId, int bookNum, string usx,
            Dictionary<int, string> chapterAuthors = null)
        {
            Dictionary<string, ScrText> scrTexts = new Dictionary<string, ScrText>();
            try
            {
                string username = GetParatextUsername(userSecret);
                ScrText scrText = ScrTextCollection.FindById(username, projectId);

                // We add this here so we can dispose in the finally
                scrTexts.Add(userSecret.Id, scrText);
                var doc = new XmlDocument
                {
                    PreserveWhitespace = true
                };
                doc.LoadXml(usx);
                UsxFragmenter.FindFragments(scrText.ScrStylesheet(bookNum), doc.CreateNavigator(),
                    XPathExpression.Compile("*[false()]"), out string usfm);
                usfm = UsfmToken.NormalizeUsfm(scrText.ScrStylesheet(bookNum), usfm, false, scrText.RightToLeft, scrText);

                if (chapterAuthors == null || chapterAuthors.Count == 0)
                {
                    // If we don't have chapter authors, update book as current user
                    if (scrText.Permissions.AmAdministrator)
                    {
                        // if the current user is an administrator, then always allow editing the book text even if the user
                        // doesn't have permission. This will ensure that a sync by an administrator never fails.
                        scrText.Permissions.RunWithEditPermision(bookNum,
                            () => scrText.PutText(bookNum, 0, false, usfm, null));
                    }
                    else
                    {
                        scrText.PutText(bookNum, 0, false, usfm, null);
                    }
                    _logger.LogInformation("{0} updated {1} in {2}.", userSecret.Id,
                        Canon.BookNumberToEnglishName(bookNum), scrText.Name);
                }
                else
                {
                    // As we have a list of chapter authors, build a dictionary of ScrTexts for each of them
                    foreach (string userId in chapterAuthors.Values.Distinct())
                    {
                        if (userId != userSecret.Id)
                        {
                            // Get their user secret, so we can get their username, and create their ScrText
                            UserSecret authorUserSecret = await _userSecretRepository.GetAsync(userId);
                            string authorUserName = GetParatextUsername(authorUserSecret);
                            scrTexts.Add(userId, ScrTextCollection.FindById(authorUserName, projectId));
                        }
                    }

                    // If there is only one author, just write the book
                    if (scrTexts.Count == 1)
                    {
                        scrTexts.Values.First().PutText(bookNum, 0, false, usfm, null);
                        _logger.LogInformation("{0} updated {1} in {2}.", scrTexts.Keys.First(),
                            Canon.BookNumberToEnglishName(bookNum), scrText.Name);
                    }
                    else
                    {
                        // Split the usfm into chapters
                        List<string> chapters = ScrText.SplitIntoChapters(scrText.Name, bookNum, usfm);

                        // Put the individual chapters
                        foreach ((int chapterNum, string authorUserId) in chapterAuthors)
                        {
                            if ((chapterNum - 1) < chapters.Count)
                            {
                                // The ScrText permissions will be the same as the last sync's permissions, so no need to check
                                scrTexts[authorUserId].PutText(bookNum, chapterNum, false, chapters[chapterNum - 1], null);
                                _logger.LogInformation("{0} updated chapter {1} of {2} in {3}.", authorUserId,
                                    chapterNum, Canon.BookNumberToEnglishName(bookNum), scrText.Name);
                            }
                        }
                    }
                }
            }
            finally
            {
                // Dispose the ScrText objects
                foreach (ScrText scrText in scrTexts.Values)
                {
                    scrText.Dispose();
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
            string username = GetParatextUsername(userSecret);
            List<string> users = new List<string>();
            int nbrAddedComments = 0, nbrDeletedComments = 0, nbrUpdatedComments = 0;
            using ScrText scrText = ScrTextCollection.FindById(username, projectId);
            if (scrText == null)
                throw new DataNotFoundException("Can't get access to cloned project.");
            CommentManager manager = CommentManager.Get(scrText);
            var ptUser = new SFParatextUser(username);
            var notes = NotesFormatter.ParseNotes(notesText, ptUser);

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
                return _hgHelper.GetLastPublicRevision(scrText.Directory, allowEmptyIfRestoredFromBackup: false);
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
                return false;
            }

            // Get the scripture text
            using ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), paratextId);

            // If we do not have a scripture text, do not back up
            if (scrText == null)
            {
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
            catch (Exception)
            {
                // An error has occurred, so the backup was not created
                return false;
            }
        }

        public bool RestoreRepository(UserSecret userSecret, string paratextId)
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
                    Path.Combine(Paratext.Data.ScrTextCollection.SettingsDirectory, "_Backups\\", scrText.Guid.ToString());
                string restoredDestination = destination + "_Restored";
                string backupPath = destination + ".bndl";

                try
                {
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

                    // Restore the Mercurial database, and move it to the repository
                    _hgHelper.RestoreRepository(restoredDestination, backupPath);
                    _fileSystemService.MoveDirectory(restoredDestination, source);
                    return true;
                }
                catch (Exception)
                {
                    // On error, move the backup destination back to the repository folder
                    if (!_fileSystemService.DirectoryExists(source))
                    {
                        _fileSystemService.MoveDirectory(destination, source);
                    }
                }
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
                    Path.Combine(Paratext.Data.ScrTextCollection.SettingsDirectory, "_Backups\\", $"{scrText.Guid}.bndl");
                return _fileSystemService.FileExists(path);
            }
            catch (Exception)
            {
                // An error occurred
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
        ///</summary>
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
                    userSecret = await _userSecretRepository.UpdateAsync(userId, b => b.Set(u => u.ParatextTokens, refreshedUserTokens));
                }
                return new ParatextAccessLock(semaphore, userSecret);
            }
            catch
            {
                // If an exception is thrown between awaiting the semaphore and returning the ParatextAccessLock, the
                // caller of the method will not get a reference to a ParatextAccessLock and can't release the semaphore.
                semaphore.Release();
                throw;
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
