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
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _tokenRefreshSemaphores = new ConcurrentDictionary<string, SemaphoreSlim>();

        public ParatextService(IWebHostEnvironment env, IOptions<ParatextOptions> paratextOptions,
            IRepository<UserSecret> userSecretRepository, IRealtimeService realtimeService,
            IExceptionHandler exceptionHandler, IOptions<SiteOptions> siteOptions, IFileSystemService fileSystemService,
            ILogger<ParatextService> logger, IJwtTokenHelper jwtTokenHelper, IParatextDataHelper paratextDataHelper,
            IInternetSharedRepositorySourceProvider internetSharedRepositorySourceProvider, IGuidService guidService,
            ISFRestClientFactory restClientFactory)
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
        /// Synchronizes the text and notes data on the SF server with the data on the Paratext server.
        /// </summary>
        public async Task SendReceiveAsync(UserSecret userSecret, string ptTargetId,
            IProgress<ProgressState> progress = null)
        {
            if (userSecret == null || ptTargetId == null) { throw new ArgumentNullException(); }

            IInternetSharedRepositorySource source = await GetInternetSharedRepositorySource(userSecret.Id);
            IEnumerable<SharedRepository> repositories = source.GetRepositories();
            IEnumerable<ProjectMetadata> projectsMetadata = source.GetProjectsMetaData();
            IEnumerable<string> projectGuids = projectsMetadata.Select(pmd => pmd.ProjectGuid.Id);
            Dictionary<string, ParatextProject> ptProjectsAvailable =
                GetProjects(userSecret, repositories, projectsMetadata).ToDictionary(ptProject => ptProject.ParatextId);
            if (!projectGuids.Contains(ptTargetId))
            {
                // See if this is a resource
                IReadOnlyList<ParatextResource> resources = await this.GetResourcesInternalAsync(userSecret.Id, true);
                ParatextResource resource = resources.SingleOrDefault(r => r.ParatextId == ptTargetId);
                if (resource != null)
                {
                    ptProjectsAvailable.Add(resource.ParatextId, resource);
                }
                else
                {
                    _logger.LogWarning($"The target project did not have a full name available {ptTargetId}");
                }
            }
            if (!ptProjectsAvailable.TryGetValue(ptTargetId, out ParatextProject targetPtProject))
            {
                throw new ArgumentException(
                    $"PT projects with the following PT ids were requested but without access or they don't exist: {ptTargetId}");
            }

            EnsureProjectReposExists(userSecret, targetPtProject, source);
            StartProgressReporting(progress);
            if (!(targetPtProject is ParatextResource))
            {
                SharedProject targetSharedProj = SharingLogicWrapper.CreateSharedProject(ptTargetId,
                    targetPtProject.ShortName, source.AsInternetSharedRepositorySource(), repositories);
                string username = GetParatextUsername(userSecret);
                // Specifically set the ScrText property of the SharedProject to indicate the project is available locally
                targetSharedProj.ScrText = ScrTextCollection.FindById(username, ptTargetId);
                targetSharedProj.Permissions = targetSharedProj.ScrText.Permissions;
                List<SharedProject> sharedPtProjectsToSr = new List<SharedProject> { targetSharedProj };

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
            IInternetSharedRepositorySource ptRepoSource = await GetInternetSharedRepositorySource(userSecret.Id);
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
            return await this.GetResourcesInternalAsync(userId, false);
        }

        public async Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId)
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
            return _jwtTokenHelper.GetParatextUsername(userSecret);
        }

        /// <summary>
        /// Gets the permission a user has to access a resource.
        /// </summary>
        /// <param name="paratextId">The paratext resource identifier.</param>
        /// <param name="userId">The user identifier.</param>
        /// <returns>
        /// A dictionary of permissions where the key is the user ID and the value is the permission
        /// </returns>
        /// <remarks>
        /// See <see cref="TextInfoPermission" /> for permission values.
        /// </remarks>
        public async Task<string> GetResourcePermissionAsync(string paratextId, string userId)
        {
            // See if the source is a resource
            if (paratextId.Length != SFInstallableDblResource.ResourceIdentifierLength)
            {
                // Default to no permissions for projects used as sources
                return TextInfoPermission.None;
            }
            using (ParatextAccessLock accessLock = await GetParatextAccessLock(userId))
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
            string paratextId)
        {
            // Skip all the work if the project is a resource. Resources don't have project members
            if (paratextId.Length == SFInstallableDblResource.ResourceIdentifierLength)
            {
                return new Dictionary<string, string>();
            }

            // Get the mapping for paratext users ids to usernames from the registry
            string response = await CallApiAsync(userSecret, HttpMethod.Get,
                $"projects/{paratextId}/members");
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
            IReadOnlyDictionary<string, string> ptUsernameMapping, int book = 0, int chapter = 0)
        {
            var permissions = new Dictionary<string, string>();

            // See if the source is a resource
            if (project.ParatextId.Length == SFInstallableDblResource.ResourceIdentifierLength)
            {
                foreach (string uid in project.UserRoles.Keys)
                {
                    permissions.Add(uid, await this.GetResourcePermissionAsync(project.ParatextId, uid));
                }
            }
            else
            {
                // Get the scripture text so we can retrieve the permissions from the XML
                ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), project.ParatextId);

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
            string projectId)
        {
            if (projectId.Length == SFInstallableDblResource.ResourceIdentifierLength)
            {
                // Resources do not have roles
                return new Dictionary<string, string>();
            }
            else
            {
                // Paratext RegistryServer has methods to do this, but it is unreliable to use it in a multi-user
                // environment so instead we call the registry API.
                string response = await CallApiAsync(userSecret, HttpMethod.Get,
                    $"projects/{projectId}/members");
                var members = JArray.Parse(response);
                return members.OfType<JObject>()
                    .Where(m => !string.IsNullOrEmpty((string)m["userId"]) && !string.IsNullOrEmpty((string)m["role"]))
                    .ToDictionary(m => (string)m["userId"], m => (string)m["role"]);
            }
        }

        /// <summary> Determine if a specific project is in a right to left language. </summary>
        public bool IsProjectLanguageRightToLeft(UserSecret userSecret, string ptProjectId)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), ptProjectId);
            return scrText == null ? false : scrText.RightToLeft;
        }

        /// <summary> Get list of book numbers in PT project. </summary>
        public IReadOnlyList<int> GetBookList(UserSecret userSecret, string ptProjectId)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), ptProjectId);
            if (scrText == null)
                return Array.Empty<int>();
            return scrText.Settings.BooksPresentSet.SelectedBookNumbers.ToArray();
        }

        /// <summary> Get PT book text in USX, or throw if can't. </summary>
        public string GetBookText(UserSecret userSecret, string ptProjectId, int bookNum)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), ptProjectId);
            if (scrText == null)
                throw new DataNotFoundException("Can't get access to cloned project.");
            string usfm = scrText.GetText(bookNum);
            return UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
        }

        /// <summary> Write up-to-date book text from mongo database to Paratext project folder. </summary>
        public async Task PutBookText(UserSecret userSecret, string projectId, int bookNum, string usx,
            Dictionary<int, string> chapterAuthors = null)
        {
            string username = GetParatextUsername(userSecret);
            ScrText scrText = ScrTextCollection.FindById(username, projectId);
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
                Dictionary<string, ScrText> scrTexts = new Dictionary<string, ScrText>();
                foreach (string userId in chapterAuthors.Values.Distinct())
                {
                    if (userId == userSecret.Id)
                    {
                        scrTexts.Add(userId, scrText);
                    }
                    else
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
            var changeList = NotesFormatter.ParseNotes(notesText, new SFParatextUser(GetParatextUsername(userSecret)));
            PutCommentThreads(userSecret, projectId, changeList);
        }

        public IEnumerable<ParatextNoteThreadChange> GetNoteThreadChanges(UserSecret userSecret, string projectId,
            int bookNum, IEnumerable<IDocument<ParatextNoteThread>> noteThreadDocs,
            Dictionary<string, SyncUser> syncUsers)
        {
            IEnumerable<CommentThread> commentThreads = GetCommentThreads(userSecret, projectId, bookNum);
            CommentTags commentTags = GetCommentTags(userSecret, projectId);
            List<string> matchedThreadIds = new List<string>();
            List<ParatextNoteThreadChange> changes = new List<ParatextNoteThreadChange>();

            foreach (var threadDoc in noteThreadDocs)
            {
                List<string> noteIdsRemoved = new List<string>();
                List<string> matchedCommentIds = new List<string>();
                ParatextNoteThreadChange threadChange = new ParatextNoteThreadChange(threadDoc.Data.DataId,
                    threadDoc.Data.VerseRef.ToString(), threadDoc.Data.SelectedText, threadDoc.Data.ContextBefore,
                    threadDoc.Data.ContextAfter, threadDoc.Data.StartPosition);
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
                        GetMatchingCommentFromNote(note, existingThread, syncUsers);
                    if (matchedComment != null)
                    {
                        matchedCommentIds.Add(matchedComment.Id);
                        ChangeType changeType = GetCommentChangeType(matchedComment, note);
                        if (changeType != ChangeType.None)
                        {
                            SyncUser syncUser = FindOrCreateSyncUser(matchedComment.User, syncUsers);
                            threadChange.AddChange(
                                CreateNoteFromComment(note.DataId, matchedComment, commentTags, syncUser), changeType);
                        }
                    }
                    else
                        threadChange.NoteIdsRemoved.Add(note.DataId);
                }
                // Add new Comments to note thread change
                IEnumerable<string> ptCommentIds = existingThread.Comments.Select(c => c.Id);
                IEnumerable<string> newCommentIds = ptCommentIds.Except(matchedCommentIds);
                foreach (string commentId in newCommentIds)
                {
                    Paratext.Data.ProjectComments.Comment comment =
                        existingThread.Comments.Single(c => c.Id == commentId);
                    SyncUser syncUser = FindOrCreateSyncUser(comment.User, syncUsers);
                    threadChange.AddChange(CreateNoteFromComment(
                        _guidService.NewObjectId(), comment, commentTags, syncUser), ChangeType.Added);
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

                int tagId = info.TagsAdded != null && info.TagsAdded.Length > 0 ? int.Parse(info.TagsAdded[0]) : 1;
                string originalTagIcon = commentTags.Get(tagId).Icon;
                ParatextNoteThreadChange newThread = new ParatextNoteThreadChange(threadId, info.VerseRefStr,
                    info.SelectedText, info.ContextBefore, info.ContextAfter, info.StartPosition, originalTagIcon);
                foreach (var comm in thread.Comments)
                {
                    SyncUser syncUser = FindOrCreateSyncUser(comm.User, syncUsers);
                    newThread.AddChange(CreateNoteFromComment(_guidService.NewObjectId(), comm, commentTags, syncUser),
                        ChangeType.Added);
                }
                changes.Add(newThread);
            }
            return changes;
        }

        public void UpdateParatextComments(UserSecret userSecret, string projectId, int bookNum,
            IEnumerable<IDocument<ParatextNoteThread>> noteThreadDocs, Dictionary<string, SyncUser> syncUsers)
        {
            CommentTags commentTags = GetCommentTags(userSecret, projectId);
            string username = GetParatextUsername(userSecret);
            IEnumerable<CommentThread> commentThreads =
                GetCommentThreads(userSecret, projectId, bookNum);
            List<List<Paratext.Data.ProjectComments.Comment>> noteThreadChangeList =
                SFNotesToCommentChangeList(noteThreadDocs, commentThreads, username, commentTags, syncUsers);

            PutCommentThreads(userSecret, projectId, noteThreadChangeList);
        }


        protected override void DisposeManagedResources()
        {
            _registryClient.Dispose();
            _httpClientHandler.Dispose();
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
            HgWrapper.SetDefault(new Hg(customHgPath, hgMerge, AssemblyDirectory));
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
            bool targetNeedsCloned =
                ScrTextCollection.FindById(username, target.ParatextId) == null;
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
                HgWrapper.Init(clonePath);
            }
            source.Pull(clonePath, repo);
            HgWrapper.Update(clonePath);
        }

        private IEnumerable<CommentThread> GetCommentThreads(UserSecret userSecret, string projectId, int bookNum)
        {
            ScrText scrText = ScrTextCollection.FindById(GetParatextUsername(userSecret), projectId);
            if (scrText == null)
                return null;

            CommentManager manager = CommentManager.Get(scrText);
            var threads = manager.FindThreads((commentThread) =>
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
            var ptUser = new SFParatextUser(username);

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
            string url, string content = null)
        {
            using (ParatextAccessLock accessLock = await GetParatextAccessLock(userSecret.Id))
            using (var request = new HttpRequestMessage(method, $"api8/{url}"))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer",
                    accessLock.UserSecret.ParatextTokens.AccessToken);
                if (content != null)
                {
                    request.Content = new StringContent(content);
                }
                HttpResponseMessage response = await _registryClient.SendAsync(request);
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
        private async Task<IInternetSharedRepositorySource> GetInternetSharedRepositorySource(string userId)
        {
            using (ParatextAccessLock accessLock = await GetParatextAccessLock(userId))
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
        private async Task<IReadOnlyList<ParatextResource>> GetResourcesInternalAsync(string userId, bool includeInstallableResource)
        {
            IEnumerable<SFInstallableDblResource> resources;
            using (ParatextAccessLock accessLock = await GetParatextAccessLock(userId))
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
            Dictionary<string, SyncUser> syncUsers)
        {
            SyncUser syncUser = note.SyncUserRef == null
                ? null
                : syncUsers.Values.SingleOrDefault(u => u.Id == note.SyncUserRef);
            if (syncUser == null)
                return null;
            string date = new DateTimeOffset(note.DateCreated).ToString("o");
            // Comment ids are generated using the Paratext username. Since we do not want to transparently
            // store a username to a note in SF we construct the intended Comment id at runtime.
            string commentId = string.Format("{0}/{1}/{2}", note.ThreadId, syncUser.ParatextUsername, date);
            Paratext.Data.ProjectComments.Comment matchingComment =
                thread.Comments.SingleOrDefault(c => c.Id == commentId);
            if (matchingComment != null)
                return matchingComment;

            // Try another method to find the comment
            DateTime noteTime = note.DateCreated.ToUniversalTime();
            return thread.Comments
                .Where(c => DateTime.Equals(noteTime, DateTime.Parse(c.Date, null, DateTimeStyles.AdjustToUniversal)))
                .SingleOrDefault(c => c.User == syncUser.ParatextUsername);
        }

        /// <summary>
        /// Get the comment change lists from the up-to-date note thread docs in the Scripture Forge mongo database.
        /// </summary>
        private List<List<Paratext.Data.ProjectComments.Comment>> SFNotesToCommentChangeList(
            IEnumerable<IDocument<ParatextNoteThread>> noteThreadDocs, IEnumerable<CommentThread> commentThreads,
            string defaultUsername, CommentTags commentTags, Dictionary<string, SyncUser> syncUsers)
        {
            List<List<Paratext.Data.ProjectComments.Comment>> changes =
                new List<List<Paratext.Data.ProjectComments.Comment>>();
            IEnumerable<IDocument<ParatextNoteThread>> activeThreadDocs = noteThreadDocs.Where(t => t.Data != null);
            List<string> matchedThreadIds = new List<string>();
            foreach (IDocument<ParatextNoteThread> threadDoc in activeThreadDocs)
            {
                List<Paratext.Data.ProjectComments.Comment> thread = new List<Paratext.Data.ProjectComments.Comment>();
                CommentThread existingThread = commentThreads.SingleOrDefault(ct => ct.Id == threadDoc.Data.DataId);
                List<(int, string)> threadNoteSyncUserIds = new List<(int, string)>();
                for (int i = 0; i < threadDoc.Data.Notes.Count; i++)
                {
                    Note note = threadDoc.Data.Notes[i];
                    Paratext.Data.ProjectComments.Comment matchedComment = existingThread == null
                        ? null
                        : GetMatchingCommentFromNote(note, existingThread, syncUsers);
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
                        SyncUser syncUser;
                        UserSecret userSecret = _userSecretRepository.Query().FirstOrDefault(s => s.Id == note.OwnerRef);
                        if (userSecret == null)
                            syncUser = FindOrCreateSyncUser(defaultUsername, syncUsers);
                        else
                            syncUser = FindOrCreateSyncUser(GetParatextUsername(userSecret), syncUsers);

                        SFParatextUser ptUser = new SFParatextUser(syncUser.ParatextUsername);
                        var comment = new Paratext.Data.ProjectComments.Comment(ptUser)
                        {
                            VerseRefStr = threadDoc.Data.VerseRef.ToString(),
                            SelectedText = threadDoc.Data.SelectedText,
                            ContextBefore = threadDoc.Data.ContextBefore,
                            ContextAfter = threadDoc.Data.ContextAfter,
                            StartPosition = threadDoc.Data.StartPosition
                        };
                        ExtractCommentFromNote(note, comment, commentTags);
                        thread.Add(comment);
                        if (note.SyncUserRef == null)
                        {
                            threadNoteSyncUserIds.Add((i, syncUser.Id));
                        }
                    }
                }
                if (thread.Count() > 0)
                    changes.Add(thread);
                // Set the sync user ref on the notes in the SF Mongo DB
                threadDoc.SubmitJson0OpAsync(op =>
                {
                    foreach ((int index, string syncUserId) in threadNoteSyncUserIds)
                        op.Set(t => t.Notes[index].SyncUserRef, syncUserId);
                });
            }
            return changes;
        }

        private ChangeType GetCommentChangeType(Paratext.Data.ProjectComments.Comment comment, Note note)
        {
            if (comment.Deleted != note.Deleted)
                return ChangeType.Deleted;
            // If the content does not match it has been updated in Paratext
            if (comment.Contents?.InnerXml != note.Content)
                return ChangeType.Updated;
            return ChangeType.None;
        }

        private void ExtractCommentFromNote(Note note, Paratext.Data.ProjectComments.Comment comment,
            CommentTags commentTags)
        {

            comment.Thread = note.ThreadId;
            comment.Date = new DateTimeOffset(note.DateCreated).ToString("o");
            comment.Deleted = note.Deleted;

            comment.AddTextToContent("", false);
            comment.Contents.InnerXml = note.Content;
            if (_userSecretRepository.Query().Any(u => u.Id == note.OwnerRef))
                comment.ExternalUser = note.OwnerRef;
            if (note.TagIcon != null)
            {
                var commentTag = new CommentTag(null, note.TagIcon);
                comment.TagsAdded = new[] { commentTags.FindMatchingTag(commentTag).ToString() };
            }
        }

        private Note CreateNoteFromComment(string noteId, Paratext.Data.ProjectComments.Comment comment,
            CommentTags commentTags, SyncUser syncUser)
        {
            var tag = comment.TagsAdded == null || comment.TagsAdded.Length == 0
                ? null
                : commentTags.Get(int.Parse(comment.TagsAdded[0]));
            return new Note
            {
                DataId = noteId,
                ThreadId = comment.Thread,
                ExtUserId = comment.ExternalUser,
                // The owner is unknown at this point and is determined when submitting the ops to the note thread docs
                OwnerRef = "",
                SyncUserRef = syncUser.Id,
                Content = comment.Contents?.InnerXml,
                DateCreated = DateTime.Parse(comment.Date),
                DateModified = DateTime.Parse(comment.Date),
                Deleted = comment.Deleted,
                TagIcon = tag?.Icon
            };
        }

        private SyncUser FindOrCreateSyncUser(string paratextUsername, Dictionary<string, SyncUser> syncUsers)
        {
            if (!syncUsers.TryGetValue(paratextUsername, out SyncUser syncUser))
            {
                syncUser = new SyncUser
                {
                    Id = _guidService.NewObjectId(),
                    ParatextUsername = paratextUsername
                };
                syncUsers.Add(paratextUsername, syncUser);
            }
            return syncUser;
        }

        // Make sure there are no asynchronous methods called after this until the progress is completed.
        private void StartProgressReporting(IProgress<ProgressState> progress)
        {
            if (progress == null)
                return;
            var progressDisplay = new SyncProgressDisplay(progress);
            PtxUtils.Progress.Progress.Mgr.SetDisplay(progressDisplay);
        }

        private async Task<ParatextAccessLock> GetParatextAccessLock(string userId)
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
                    Tokens refreshedUserTokens = await _jwtTokenHelper.RefreshAccessTokenAsync(_paratextOptions.Value, userSecret.ParatextTokens, _registryClient);
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
