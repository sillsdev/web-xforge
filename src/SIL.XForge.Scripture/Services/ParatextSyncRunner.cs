using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SIL.ObjectModel;
using SIL.Scripture;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class syncs real-time text and question docs with the Paratext S/R server. This class coordinates the data
    /// flow between three sources:
    /// 1. The real-time docs stored in Mongo, the SF DB.
    /// 2. The local Paratext project repo.
    /// 3. The remote Paratext project repo, aka PT Archives, aka the Send and Receive server.
    ///
    /// Algorithm:
    /// 1. The text deltas from the real-time docs are converted to USX.
    /// 2. The local repo is updated using the converted USX.
    /// 3. A note changelist is computed by diffing the the real-time question docs and the notes in the local repo.
    /// 4. The local repo is updated using the note changelist.
    /// 5. PT send/receive is performed (remote and local repos are synced).
    /// 6. Docs associated with remotely deleted books are deleted.
    /// 7. Updated USX is retrieved from the local repo.
    /// 7. The returned USX is converted back to text deltas and diffed against the current deltas.
    /// 8. The diff is submitted as an operation to the real-time text docs (chapter docs are added and deleted as
    /// needed).
    /// 9. Question docs associated with remotely deleted chapters are deleted.
    ///
    /// Target and source refer to daughter and mother translation data. Not to be confused with a target or source for
    /// where data is coming from or going to when fetching or syncing.
    /// <code>
    /// Diagram showing a high-level look at the order of data being transmitted:
    /// ┌─────┐  ┌─────┐  ┌───────────┐
    /// │SF DB├─>│Local│  │PT Archives│
    /// │     │  │PT hg├─>│           │
    /// │     │  │repo │  │           │
    /// │     │  │     │<─┤           │
    /// │     │<─┤     │  │           │
    /// └─────┘  └─────┘  └───────────┘
    /// </code>
    /// </summary>
    public class ParatextSyncRunner : IParatextSyncRunner
    {
        private static readonly IEqualityComparer<List<Chapter>> _chapterListEqualityComparer =
            SequenceEqualityComparer.Create(new ChapterEqualityComparer());

        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly IRepository<SyncMetrics> _syncMetricsRepository;
        private readonly ISFProjectService _projectService;
        private readonly IMachineProjectService _machineProjectService;
        private readonly IParatextService _paratextService;
        private readonly IRealtimeService _realtimeService;
        private readonly IDeltaUsxMapper _deltaUsxMapper;
        private readonly IParatextNotesMapper _notesMapper;
        private readonly ILogger<ParatextSyncRunner> _logger;
        private readonly IHubContext<NotificationHub, INotifier> _hubContext;

        private IConnection _conn;
        private UserSecret _userSecret;
        private IDocument<SFProject> _projectDoc;
        private SFProjectSecret _projectSecret;
        private SyncMetrics _syncMetrics;
        private Dictionary<string, ParatextUserProfile> _currentPtSyncUsers;

        public ParatextSyncRunner(
            IRepository<UserSecret> userSecrets,
            IRepository<SFProjectSecret> projectSecrets,
            IRepository<SyncMetrics> syncMetricsRepository,
            ISFProjectService projectService,
            IMachineProjectService machineProjectService,
            IParatextService paratextService,
            IRealtimeService realtimeService,
            IDeltaUsxMapper deltaUsxMapper,
            IParatextNotesMapper notesMapper,
            IHubContext<NotificationHub, INotifier> hubContext,
            ILogger<ParatextSyncRunner> logger
        )
        {
            _userSecrets = userSecrets;
            _projectSecrets = projectSecrets;
            _syncMetricsRepository = syncMetricsRepository;
            _projectService = projectService;
            _machineProjectService = machineProjectService;
            _paratextService = paratextService;
            _realtimeService = realtimeService;
            _logger = logger;
            _deltaUsxMapper = deltaUsxMapper;
            _notesMapper = notesMapper;
            _hubContext = hubContext;
        }

        private bool TranslationSuggestionsEnabled => _projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled;
        private bool CheckingEnabled => _projectDoc.Data.CheckingConfig.CheckingEnabled;

        /// <summary>
        /// Synchronize content and user permissions in SF DB with Paratext SendReceive servers and PT Registry, for
        /// a project.
        /// </summary>
        /// <remarks>
        /// Do not allow multiple sync jobs to run in parallel on the same project by creating a hangfire mutex on the
        /// <param name="projectSFId"/> parameter, i.e. "{0}".
        /// </remarks>
        [Mutex("{0}")]
        public async Task RunAsync(
            string projectSFId,
            string userId,
            string syncMetricsId,
            bool trainEngine,
            CancellationToken token
        )
        {
            // Whether or not we can rollback Paratext
            bool canRollbackParatext = false;
            try
            {
                if (!await InitAsync(projectSFId, userId, syncMetricsId, token))
                {
                    await CompleteSync(false, canRollbackParatext, trainEngine, token);
                    return;
                }

                string targetParatextId = _projectDoc.Data.ParatextId;
                string? sourceParatextId = _projectDoc.Data.TranslateConfig.Source?.ParatextId;
                string? sourceProjectRef = _projectDoc.Data.TranslateConfig.Source?.ProjectRef;
                Log($"RunAsync: Starting. Target PT id '{targetParatextId}', source PT id '{sourceParatextId}'.");

                // Determine if we can rollback Paratext
                canRollbackParatext = _paratextService.BackupExists(_userSecret, targetParatextId);
                if (!canRollbackParatext)
                {
                    // Attempt to create a backup if we cannot rollback
                    canRollbackParatext = _paratextService.BackupRepository(_userSecret, targetParatextId);
                    _syncMetrics.RepositoryBackupCreated = canRollbackParatext;
                    if (canRollbackParatext)
                    {
                        Log($"RunAsync: There wasn't already a local PT repo backup, so we made one.");
                    }
                    else
                    {
                        Log(
                            $"RunAsync: There wasn't already a local PT repo backup, so we tried to make one but failed."
                        );
                    }
                }

                ReportRepoRevs();
                await NotifySyncProgress(SyncPhase.Phase1, 50.0);

                if (_paratextService.IsResource(targetParatextId))
                {
                    Log($"This is a resource, so not considering hg repo revisions.");
                }
                else if (_projectDoc.Data.Sync.SyncedToRepositoryVersion == null)
                {
                    Log(
                        $"The SF DB SyncedToRepositoryVersion is null. Maybe this project is being Connected, or has not synced successfully since we started tracking this information."
                    );
                }
                else
                {
                    Log(
                        $"Setting hg repo to last imported hg repo rev of {_projectDoc.Data.Sync.SyncedToRepositoryVersion}."
                    );
                    _paratextService.SetRepoToRevision(
                        _userSecret,
                        targetParatextId,
                        _projectDoc.Data.Sync.SyncedToRepositoryVersion
                    );
                }

                var targetTextDocsByBook = new Dictionary<int, SortedList<int, IDocument<TextData>>>();
                var questionDocsByBook = new Dictionary<int, IReadOnlyList<IDocument<Question>>>();
                ParatextSettings settings = _paratextService.GetParatextSettings(_userSecret, targetParatextId);
                // update target Paratext books and notes
                double i = 0.0;
                foreach (TextInfo text in _projectDoc.Data.Texts)
                {
                    i++;

                    // A resource does not sync to Paratext, so lets skip phase 2 to make the progress bar look better
                    await NotifySyncProgress(
                        _paratextService.IsResource(targetParatextId) ? SyncPhase.Phase3 : SyncPhase.Phase2,
                        i / _projectDoc.Data.Texts.Count
                    );

                    LogMetric($"Updating Paratext book {text.BookNum}");
                    if (settings == null)
                    {
                        Log($"FAILED: Attempting to write to a project repository that does not exist.");
                        await CompleteSync(false, canRollbackParatext, trainEngine, token);
                        return;
                    }
                    SortedList<int, IDocument<TextData>> targetTextDocs = await FetchTextDocsAsync(text);
                    targetTextDocsByBook[text.BookNum] = targetTextDocs;
                    if (settings.Editable && !_paratextService.IsResource(targetParatextId))
                    {
                        LogMetric("Updating Paratext book");
                        await UpdateParatextBook(text, targetParatextId, targetTextDocs);
                    }

                    IReadOnlyList<IDocument<Question>> questionDocs = await FetchQuestionDocsAsync(text);
                    questionDocsByBook[text.BookNum] = questionDocs;
                    if (!_paratextService.IsResource(targetParatextId))
                    {
                        LogMetric("Updating paratext notes");
                        await UpdateParatextNotesAsync(text, questionDocs);
                        // TODO: Sync Note changes back to Paratext, and record sync metric info
                        // IEnumerable<IDocument<NoteThread>> noteThreadDocs =
                        //     (await FetchNoteThreadDocsAsync(text.BookNum)).Values;
                        // await _paratextService.UpdateParatextCommentsAsync(_userSecret, targetParatextId, text.BookNum,
                        //     noteThreadDocs, _currentPtSyncUsers);
                    }
                }

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, trainEngine, token);
                    return;
                }

                // Use the new progress bar
                var progress = new SyncProgress();
                ParatextProject paratextProject;
                try
                {
                    // Create the handler
                    progress.ProgressUpdated += SyncProgress_ProgressUpdated;

                    Log($"RunAsync: Going to do ParatextData SendReceive.");
                    // perform Paratext send/receive
                    paratextProject = await _paratextService.SendReceiveAsync(
                        _userSecret,
                        targetParatextId,
                        progress,
                        token
                    );
                    Log($"RunAsync: ParatextData SendReceive finished without throwing.");
                }
                finally
                {
                    // Deregister the handler
                    progress.ProgressUpdated -= SyncProgress_ProgressUpdated;
                }

                await NotifySyncProgress(SyncPhase.Phase4, 30.0);

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, trainEngine, token);
                    return;
                }

                var targetBooks = new HashSet<int>(_paratextService.GetBookList(_userSecret, targetParatextId));
                var sourceBooks = new HashSet<int>(_paratextService.GetBookList(_userSecret, sourceParatextId));
                sourceBooks.IntersectWith(targetBooks);

                var targetBooksToDelete = new HashSet<int>(
                    _projectDoc.Data.Texts.Select(t => t.BookNum).Except(targetBooks)
                );

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, trainEngine, token);
                    return;
                }

                // delete all data for removed books
                if (targetBooksToDelete.Count > 0)
                {
                    Log(
                        $"RunAsync: Going to delete texts and questions,comments,answers for {targetBooksToDelete.Count} books."
                    );
                    // delete target books
                    foreach (int bookNum in targetBooksToDelete)
                    {
                        LogMetric($"Deleting book {bookNum}");
                        int textIndex = _projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                        TextInfo text = _projectDoc.Data.Texts[textIndex];
                        await _projectDoc.SubmitJson0OpAsync(op => op.Remove(pd => pd.Texts, textIndex));

                        await DeleteAllTextDocsForBookAsync(text);
                        await DeleteAllQuestionsDocsForBookAsync(text);
                        await DeleteNoteThreadDocsInChapters(text.BookNum, text.Chapters);
                    }

                    _syncMetrics.Books.Deleted = targetBooksToDelete.Count;
                }

                await NotifySyncProgress(SyncPhase.Phase4, 60.0);

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, trainEngine, token);
                    return;
                }

                // Update user resource access, if this project has a source resource
                // The updating of a source project's permissions is done when that project is synced.
                if (
                    TranslationSuggestionsEnabled
                    && !string.IsNullOrWhiteSpace(sourceParatextId)
                    && !string.IsNullOrWhiteSpace(sourceProjectRef)
                    && _paratextService.IsResource(sourceParatextId)
                )
                {
                    LogMetric("Updating user resource access");

                    // Get the resource project
                    IDocument<SFProject> sourceProject = await _conn.FetchAsync<SFProject>(sourceProjectRef);
                    if (sourceProject.IsLoaded)
                    {
                        // NOTE: The following additions/removals not included in the transaction

                        // Add new users who are in the target project, but not the source project
                        List<string> usersToAdd = _projectDoc.Data.UserRoles.Keys
                            .Except(sourceProject.Data.UserRoles.Keys)
                            .ToList();
                        foreach (string uid in usersToAdd)
                        {
                            // As resource projects do not have administrators, we connect as the user we are to add
                            try
                            {
                                await _projectService.AddUserAsync(uid, sourceProjectRef);
                                _syncMetrics.ResourceUsers.Added++;
                            }
                            catch (ForbiddenException e)
                            {
                                // The user does not have Paratext access
                                Log($"RunAsync: Error attempting to add a user to the resource access list: {e}");
                            }
                        }

                        // Remove users who are in the target project, and no longer have access
                        List<string> usersToCheck = _projectDoc.Data.UserRoles.Keys.Except(usersToAdd).ToList();
                        foreach (string uid in usersToCheck)
                        {
                            string permission = await _paratextService.GetResourcePermissionAsync(
                                sourceParatextId,
                                uid,
                                token
                            );
                            if (permission == TextInfoPermission.None)
                            {
                                await _projectService.RemoveUserWithoutPermissionsCheckAsync(
                                    uid,
                                    sourceProjectRef,
                                    uid
                                );
                                _syncMetrics.ResourceUsers.Deleted++;
                            }
                        }
                    }
                }

                await NotifySyncProgress(SyncPhase.Phase4, 90.0);

                bool resourceNeedsUpdating =
                    paratextProject is ParatextResource paratextResource
                    && _paratextService.ResourceDocsNeedUpdating(_projectDoc.Data, paratextResource);

                if (!_paratextService.IsResource(targetParatextId) || resourceNeedsUpdating)
                {
                    await UpdateDocsAsync(
                        targetParatextId,
                        targetTextDocsByBook,
                        questionDocsByBook,
                        targetBooks,
                        sourceBooks,
                        token
                    );
                }
                await NotifySyncProgress(SyncPhase.Phase6, 20.0);

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, trainEngine, token);
                    return;
                }

                // Update the resource configuration
                if (resourceNeedsUpdating)
                {
                    LogMetric("Updating resource config");
                    await UpdateResourceConfig(paratextProject);
                }

                // We will always update permissions, even if this is a resource project
                LogMetric("Updating permissions");
                await _projectService.UpdatePermissionsAsync(userId, _projectDoc, token);

                await NotifySyncProgress(SyncPhase.Phase6, 40.0);

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, trainEngine, token);
                    return;
                }

                await CompleteSync(true, canRollbackParatext, trainEngine, token);
            }
            catch (Exception e)
            {
                if (e is not TaskCanceledException)
                {
                    StringBuilder additionalInformation = new StringBuilder();
                    foreach (var key in e.Data.Keys)
                    {
                        additionalInformation.AppendLine($"{key}: {e.Data[key]}");
                    }

                    string message =
                        $"Error occurred while executing Paratext sync for project with SF id '{projectSFId}'. {(additionalInformation.Length == 0 ? string.Empty : $"Additional information: {additionalInformation}")}";
                    _syncMetrics.ErrorDetails = $"{e}{Environment.NewLine}{message}";
                    _logger.LogError(e, message);
                    LogMetric(message);
                }

                await CompleteSync(false, canRollbackParatext, trainEngine, token);
            }
            finally
            {
                CloseConnection();
            }
        }

        /// <summary>
        /// Updates the resource configuration
        /// </summary>
        /// <param name="project">The SF project.</param>
        /// <param name="paratextProject">The Paratext project. This should be a resource.</param>
        /// <returns>The asynchronous task.</returns>
        /// <remarks>Only call this if the config requires an update.</remarks>
        private async Task UpdateResourceConfig(ParatextProject paratextProject)
        {
            // Update the resource configuration
            if (paratextProject is ParatextResource paratextResource)
            {
                if (_projectDoc.Data.ResourceConfig == null)
                {
                    // Create the resource config
                    await _projectDoc.SubmitJson0OpAsync(
                        op =>
                            op.Set(
                                pd => pd.ResourceConfig,
                                new ResourceConfig
                                {
                                    CreatedTimestamp = paratextResource.CreatedTimestamp,
                                    ManifestChecksum = paratextResource.ManifestChecksum,
                                    PermissionsChecksum = paratextResource.PermissionsChecksum,
                                    Revision = paratextResource.AvailableRevision,
                                }
                            )
                    );
                }
                else
                {
                    // Update the resource config
                    await _projectDoc.SubmitJson0OpAsync(op =>
                    {
                        op.Set(pd => pd.ResourceConfig.CreatedTimestamp, paratextResource.CreatedTimestamp);
                        op.Set(pd => pd.ResourceConfig.ManifestChecksum, paratextResource.ManifestChecksum);
                        op.Set(pd => pd.ResourceConfig.PermissionsChecksum, paratextResource.PermissionsChecksum);
                        op.Set(pd => pd.ResourceConfig.Revision, paratextResource.AvailableRevision);
                    });
                }
            }
        }

        private async Task PreflightAuthenticationReportAsync()
        {
            bool canAuthToRegistry = await _paratextService.CanUserAuthenticateToPTRegistryAsync(_userSecret);
            bool canAuthToArchives = await _paratextService.CanUserAuthenticateToPTArchivesAsync(_userSecret.Id);
            Log($"User can authenticate to PT Registry: {canAuthToRegistry}, to PT Archives: {canAuthToArchives}.");
        }

        private async Task UpdateDocsAsync(
            string targetParatextId,
            Dictionary<int, SortedList<int, IDocument<TextData>>> targetTextDocsByBook,
            Dictionary<int, IReadOnlyList<IDocument<Question>>> questionDocsByBook,
            HashSet<int> targetBooks,
            HashSet<int> sourceBooks,
            CancellationToken token
        )
        {
            Dictionary<string, string> ptUsernamesToSFUserIds = await GetPTUsernameToSFUserIdsAsync(token);

            // update source and target real-time docs
            double i = 0.0;
            foreach (int bookNum in targetBooks)
            {
                i++;
                await NotifySyncProgress(SyncPhase.Phase5, i / targetBooks.Count);
                LogMetric($"Updating text info for book {bookNum}");
                bool hasSource = sourceBooks.Contains(bookNum);
                int textIndex = _projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                TextInfo text;
                if (textIndex == -1)
                {
                    text = new TextInfo { BookNum = bookNum, HasSource = hasSource };
                    _syncMetrics.Books.Added++;
                }
                else
                {
                    text = _projectDoc.Data.Texts[textIndex];
                    _syncMetrics.Books.Updated++;
                }

                // update target text docs
                if (
                    !targetTextDocsByBook.TryGetValue(
                        text.BookNum,
                        out SortedList<int, IDocument<TextData>> targetTextDocs
                    )
                )
                {
                    targetTextDocs = new SortedList<int, IDocument<TextData>>();
                }

                LogMetric("Updating text docs");
                List<Chapter> newSetOfChapters = await UpdateTextDocsAsync(text, targetParatextId, targetTextDocs);

                // update question docs
                if (questionDocsByBook.TryGetValue(text.BookNum, out IReadOnlyList<IDocument<Question>> questionDocs))
                {
                    LogMetric("Updating question docs");
                    await UpdateQuestionDocsAsync(questionDocs, newSetOfChapters);
                }

                // update note thread docs
                LogMetric("Updating thread docs");
                Dictionary<string, IDocument<NoteThread>> noteThreadDocs = await FetchNoteThreadDocsAsync(text.BookNum);
                Dictionary<int, ChapterDelta> chapterDeltas = GetDeltasByChapter(text, targetParatextId);

                await UpdateNoteThreadDocsAsync(text, noteThreadDocs, token, chapterDeltas, ptUsernamesToSFUserIds);

                // update project metadata
                await _projectDoc.SubmitJson0OpAsync(op =>
                {
                    if (textIndex == -1)
                    {
                        // insert text info for new text
                        text.Chapters = newSetOfChapters;
                        op.Add(pd => pd.Texts, text);
                    }
                    else
                    {
                        // update text info
                        op.Set(pd => pd.Texts[textIndex].Chapters, newSetOfChapters, _chapterListEqualityComparer);
                        op.Set(pd => pd.Texts[textIndex].HasSource, hasSource);
                    }
                });
            }
        }

        internal async Task<bool> InitAsync(
            string projectSFId,
            string userId,
            string syncMetricsId,
            CancellationToken token
        )
        {
            await _hubContext.NotifySyncProgress(projectSFId, ProgressState.NotStarted);
            _logger.LogInformation($"Initializing sync for project {projectSFId} with sync metrics id {syncMetricsId}");
            if (!(await _syncMetricsRepository.TryGetAsync(syncMetricsId)).TryResult(out _syncMetrics))
            {
                Log($"Could not find sync metrics.", syncMetricsId, userId);
                return false;
            }

            _syncMetrics.DateStarted = DateTime.UtcNow;
            _syncMetrics.Status = SyncStatus.Running;
            if (!await _syncMetricsRepository.ReplaceAsync(_syncMetrics, true))
            {
                Log("The sync metrics could not be updated in MongoDB");
            }

            _conn = await _realtimeService.ConnectAsync();
            _conn.BeginTransaction();
            _conn.ExcludePropertyFromTransaction<SFProject>(op => op.Sync.QueuedCount);
            _conn.ExcludePropertyFromTransaction<SFProject>(op => op.Sync.DataInSync);
            _projectDoc = await _conn.FetchAsync<SFProject>(projectSFId);
            if (!_projectDoc.IsLoaded)
            {
                Log($"Project doc was not loaded.", projectSFId, userId);
                return false;
            }

            await NotifySyncProgress(SyncPhase.Phase1, 10.0);

            if (!(await _projectSecrets.TryGetAsync(projectSFId)).TryResult(out _projectSecret))
            {
                Log($"Could not find project secret.", projectSFId, userId);
                return false;
            }
            _currentPtSyncUsers = _projectDoc.Data.ParatextUsers.ToDictionary(u => u.Username);

            if (!(await _userSecrets.TryGetAsync(userId)).TryResult(out _userSecret))
            {
                Log($"Could not find user secret.", projectSFId, userId);
                return false;
            }

            List<User> paratextUsers = await _realtimeService
                .QuerySnapshots<User>()
                .Where(u => _projectDoc.Data.UserRoles.Keys.Contains(u.Id) && u.ParatextId != null)
                .ToListAsync();

            // Report on authentication success before other attempts.
            await PreflightAuthenticationReportAsync();

            await _notesMapper.InitAsync(_userSecret, _projectSecret, paratextUsers, _projectDoc.Data, token);

            await NotifySyncProgress(SyncPhase.Phase1, 20.0);
            return true;
        }

        internal void CloseConnection()
        {
            _conn?.Dispose();
        }

        private async Task UpdateParatextBook(
            TextInfo text,
            string paratextId,
            SortedList<int, IDocument<TextData>> textDocs
        )
        {
            string bookText = _paratextService.GetBookText(_userSecret, paratextId, text.BookNum);
            var oldUsxDoc = XDocument.Parse(bookText);
            XDocument newUsxDoc = _deltaUsxMapper.ToUsx(
                oldUsxDoc,
                text.Chapters
                    .OrderBy(c => c.Number)
                    .Select(c => new ChapterDelta(c.Number, c.LastVerse, c.IsValid, textDocs[c.Number].Data))
            );

            if (!XNode.DeepEquals(oldUsxDoc, newUsxDoc))
            {
                string usx = newUsxDoc.Root.ToString();
                var chapterAuthors = await GetChapterAuthorsAsync(text, textDocs);
                _syncMetrics.ParatextBooks.Updated += await _paratextService.PutBookText(
                    _userSecret,
                    paratextId,
                    text.BookNum,
                    usx,
                    chapterAuthors
                );
            }
        }

        /// <summary>
        /// Gets the authors for each chapter asynchronously.
        /// </summary>
        /// <param name="text">The text info.</param>
        /// <param name="textDocs">The text data, as a sorted list where the key is the chapter number.</param>
        /// <returns>
        /// A dictionary where the key is the chapter number, and the value is the user identifier of the author.
        /// </returns>
        /// <remarks>
        /// This is internal so it can be unit tested.
        /// </remarks>
        internal async Task<Dictionary<int, string>> GetChapterAuthorsAsync(
            TextInfo text,
            SortedList<int, IDocument<TextData>> textDocs
        )
        {
            // Get all of the last editors for the chapters.
            var chapterAuthors = new Dictionary<int, string>();
            foreach (Chapter chapter in text.Chapters)
            {
                // This will be from 1 to number of chapters in the book
                int chapterNum = chapter.Number;

                // Attempt to find the last user who modified this chapter
                string userSFId = null;
                if (textDocs.TryGetValue(chapterNum, out IDocument<TextData> textDoc))
                {
                    // The Id is the value from TextData.GetTextDocId()
                    string textId = textDoc.Id;
                    int version = textDoc.Version;
                    userSFId = await _realtimeService.GetLastModifiedUserIdAsync<TextData>(textId, version);

                    // Check that this user still has write permissions
                    if (
                        string.IsNullOrEmpty(userSFId)
                        || !chapter.Permissions.TryGetValue(userSFId, out string permission)
                        || permission != TextInfoPermission.Write
                    )
                    {
                        // They no longer have write access, so reset the user id, and find it below
                        userSFId = null;
                    }
                }

                // If we do not have a record of the last user to modify this chapter
                if (string.IsNullOrEmpty(userSFId))
                {
                    // See if the current user has permissions
                    if (
                        chapter.Permissions.TryGetValue(_userSecret.Id, out string permission)
                        && permission == TextInfoPermission.Write
                    )
                    {
                        userSFId = _userSecret.Id;
                    }
                    else
                    {
                        // Get the first user with write permission
                        // NOTE: As a KeyValuePair is a struct, we do not need a null-conditional (key will be null)
                        userSFId = chapter.Permissions.FirstOrDefault(p => p.Value == TextInfoPermission.Write).Key;

                        // If the userId is still null, find a project administrator, as they can escalate privilege
                        if (string.IsNullOrEmpty(userSFId))
                        {
                            userSFId = _projectDoc.Data.UserRoles
                                .FirstOrDefault(p => p.Value == SFProjectRole.Administrator)
                                .Key;
                        }
                    }
                }

                // Set the author for the chapter
                chapterAuthors.Add(chapterNum, userSFId);
            }

            return chapterAuthors;
        }

        /// <summary>
        /// Send answer-notes to Paratext. Don't send questions that have no answers.
        /// </summary>
        private async Task UpdateParatextNotesAsync(TextInfo text, IReadOnlyList<IDocument<Question>> questionDocs)
        {
            if (!CheckingEnabled)
                return;

            // TODO: need to define a data structure for notes instead of XML
            XElement oldNotesElem;
            string oldNotesText = _paratextService.GetNotes(_userSecret, _projectDoc.Data.ParatextId, text.BookNum);
            if (oldNotesText != "")
                oldNotesElem = ParseText(oldNotesText);
            else
                oldNotesElem = new XElement("notes", new XAttribute("version", "1.1"));

            XElement notesElem = await _notesMapper.GetNotesChangelistAsync(
                oldNotesElem,
                questionDocs,
                _currentPtSyncUsers,
                _projectDoc.Data.UserRoles,
                _projectDoc.Data.CheckingConfig.AnswerExportMethod
            );
            if (notesElem.Elements("thread").Any())
            {
                _syncMetrics.ParatextNotes += _paratextService.PutNotes(
                    _userSecret,
                    _projectDoc.Data.ParatextId,
                    notesElem.ToString()
                );
            }
        }

        private async Task<List<Chapter>> UpdateTextDocsAsync(
            TextInfo text,
            string paratextId,
            SortedList<int, IDocument<TextData>> textDocs,
            ISet<int>? chaptersToInclude = null
        )
        {
            string bookText = _paratextService.GetBookText(_userSecret, paratextId, text.BookNum);
            var usxDoc = XDocument.Parse(bookText);
            var tasks = new List<Task>();
            Dictionary<int, ChapterDelta> deltas = _deltaUsxMapper
                .ToChapterDeltas(usxDoc)
                .ToDictionary(cd => cd.Number);
            var chapters = new List<Chapter>();
            List<int> chaptersToRemove = textDocs.Keys.Where(c => !deltas.ContainsKey(c)).ToList();
            foreach (KeyValuePair<int, ChapterDelta> kvp in deltas)
            {
                bool addChapter = true;
                if (textDocs.TryGetValue(kvp.Key, out IDocument<TextData> textDataDoc))
                {
                    if (chaptersToInclude == null || chaptersToInclude.Contains(kvp.Key))
                    {
                        Delta diffDelta = textDataDoc.Data.Diff(kvp.Value.Delta);
                        if (diffDelta.Ops.Count > 0)
                        {
                            tasks.Add(textDataDoc.SubmitOpAsync(diffDelta));
                            _syncMetrics.TextDocs.Updated++;
                        }

                        textDocs.Remove(kvp.Key);
                    }
                    else
                    {
                        // We are not to update this chapter
                        Chapter existingChapter = text.Chapters.FirstOrDefault(c => c.Number == kvp.Key);
                        if (existingChapter != null)
                        {
                            chapters.Add(existingChapter);
                        }

                        addChapter = false;
                    }
                }
                else if (chaptersToInclude == null || chaptersToInclude.Contains(kvp.Key))
                {
                    textDataDoc = GetTextDoc(text, kvp.Key);
                    async Task createText(int chapterNum, Delta delta)
                    {
                        await textDataDoc.FetchAsync();
                        if (textDataDoc.IsLoaded)
                            await textDataDoc.DeleteAsync();
                        await textDataDoc.CreateAsync(new TextData(delta));
                    }
                    tasks.Add(createText(kvp.Key, kvp.Value.Delta));
                    _syncMetrics.TextDocs.Added++;
                }
                else
                {
                    addChapter = false;
                }
                if (addChapter)
                {
                    chapters.Add(
                        new Chapter
                        {
                            Number = kvp.Key,
                            LastVerse = kvp.Value.LastVerse,
                            IsValid = kvp.Value.IsValid,
                            Permissions = { }
                        }
                    );
                }
            }
            foreach (KeyValuePair<int, IDocument<TextData>> kvp in textDocs)
            {
                if (
                    chaptersToInclude == null
                    || chaptersToInclude.Contains(kvp.Key)
                    || chaptersToRemove.Contains(kvp.Key)
                )
                {
                    tasks.Add(kvp.Value.DeleteAsync());
                    _syncMetrics.TextDocs.Deleted++;
                }
            }

            await Task.WhenAll(tasks);
            return chapters;
        }

        private async Task UpdateQuestionDocsAsync(
            IReadOnlyList<IDocument<Question>> questionDocs,
            List<Chapter> newChapters
        )
        {
            // handle deletion of chapters
            var chapterNums = new HashSet<int>(newChapters.Select(c => c.Number));
            var tasks = new List<Task>();
            foreach (IDocument<Question> questionDoc in questionDocs)
            {
                if (!chapterNums.Contains(questionDoc.Data.VerseRef.ChapterNum))
                {
                    tasks.Add(questionDoc.DeleteAsync());
                    _syncMetrics.Questions.Deleted++;
                }
            }
            await Task.WhenAll(tasks);
        }

        /// <summary>
        /// Updates ParatextNoteThread docs for a book
        /// </summary>
        private async Task UpdateNoteThreadDocsAsync(
            TextInfo text,
            Dictionary<string, IDocument<NoteThread>> noteThreadDocs,
            CancellationToken token,
            Dictionary<int, ChapterDelta> chapterDeltas,
            Dictionary<string, string> usernamesToUserIds
        )
        {
            IEnumerable<NoteThreadChange> noteThreadChanges = _paratextService.GetNoteThreadChanges(
                _userSecret,
                _projectDoc.Data.ParatextId,
                text.BookNum,
                noteThreadDocs.Values,
                chapterDeltas,
                _currentPtSyncUsers
            );
            var tasks = new List<Task>();

            foreach (NoteThreadChange change in noteThreadChanges)
            {
                // Find the thread doc if it exists
                IDocument<NoteThread> threadDoc;
                if (!noteThreadDocs.TryGetValue(change.ThreadId, out threadDoc))
                {
                    // Create a new ParatextNoteThread doc
                    IDocument<NoteThread> doc = GetNoteThreadDoc(change.ThreadId);
                    async Task createThreadDoc(string threadId, string projectId, NoteThreadChange change)
                    {
                        VerseRef verseRef = new VerseRef();
                        verseRef.Parse(change.VerseRefStr);
                        VerseRefData vrd = new VerseRefData(verseRef.BookNum, verseRef.ChapterNum, verseRef.Verse);
                        await doc.CreateAsync(
                            new NoteThread()
                            {
                                DataId = change.ThreadId,
                                ProjectRef = _projectDoc.Id,
                                VerseRef = vrd,
                                OriginalSelectedText = change.SelectedText,
                                OriginalContextBefore = change.ContextBefore,
                                OriginalContextAfter = change.ContextAfter,
                                TagIcon = change.TagIcon,
                                Position = change.Position,
                                Status = change.Status,
                                Assignment = change.Assignment
                            }
                        );
                        await SubmitChangesOnNoteThreadDocAsync(doc, change, usernamesToUserIds);
                    }
                    tasks.Add(createThreadDoc(change.ThreadId, _projectDoc.Id, change));
                    _syncMetrics.NoteThreads.Added++;
                }
                else
                {
                    tasks.Add(SubmitChangesOnNoteThreadDocAsync(threadDoc, change, usernamesToUserIds));

                    // Record thread metrics and note metrics
                    if (change.ThreadRemoved)
                    {
                        _syncMetrics.NoteThreads.Deleted++;
                    }

                    if (change.ThreadUpdated)
                    {
                        _syncMetrics.NoteThreads.Updated++;
                    }

                    _syncMetrics.Notes += new NoteSyncMetricInfo(
                        added: change.NotesAdded.Count,
                        deleted: change.NotesDeleted.Count,
                        updated: change.NotesUpdated.Count,
                        removed: change.NoteIdsRemoved.Count
                    );
                }
            }
            await Task.WhenAll(tasks);
        }

        /// <summary>
        /// Fetches all text docs from the database for a book.
        /// </summary>
        internal async Task<SortedList<int, IDocument<TextData>>> FetchTextDocsAsync(TextInfo text)
        {
            var textDocs = new SortedList<int, IDocument<TextData>>();
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
            {
                IDocument<TextData> textDoc = GetTextDoc(text, chapter.Number);
                textDocs[chapter.Number] = textDoc;
                tasks.Add(textDoc.FetchAsync());
            }
            await Task.WhenAll(tasks);

            // Omit items that are not actually in the database.
            foreach (KeyValuePair<int, IDocument<TextData>> item in textDocs.ToList())
            {
                if (!item.Value.IsLoaded)
                {
                    textDocs.Remove(item.Key);
                }
            }
            return textDocs;
        }

        /// <summary>
        /// Deletes all text docs from the database for a book.
        /// </summary>
        private async Task DeleteAllTextDocsForBookAsync(TextInfo text)
        {
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
                tasks.Add(DeleteTextDocAsync(text, chapter.Number));
            await Task.WhenAll(tasks);
            _syncMetrics.TextDocs.Deleted += text.Chapters.Count;
        }

        private async Task<IReadOnlyList<IDocument<Question>>> FetchQuestionDocsAsync(TextInfo text)
        {
            List<string> questionDocIds = await _realtimeService
                .QuerySnapshots<Question>()
                .Where(q => q.ProjectRef == _projectDoc.Id && q.VerseRef.BookNum == text.BookNum)
                .Select(q => q.Id)
                .ToListAsync();
            var questionDocs = new IDocument<Question>[questionDocIds.Count];
            var tasks = new List<Task>();
            for (int i = 0; i < questionDocIds.Count; i++)
            {
                async Task fetchQuestion(int index)
                {
                    questionDocs[index] = await _conn.FetchAsync<Question>(questionDocIds[index]);
                }
                tasks.Add(fetchQuestion(i));
            }
            await Task.WhenAll(tasks);
            return questionDocs;
        }

        /// <summary>
        /// Fetch the ParatextNoteThread docs from the database and return it in a dictionary with threadId as the key.
        /// </summary>
        private async Task<Dictionary<string, IDocument<NoteThread>>> FetchNoteThreadDocsAsync(int bookNum)
        {
            List<string> noteThreadDocIds = await _realtimeService
                .QuerySnapshots<NoteThread>()
                .Where(pnt => pnt.ProjectRef == _projectDoc.Id && pnt.VerseRef.BookNum == bookNum)
                .Select(pnt => pnt.Id)
                .ToListAsync();
            IDocument<NoteThread>[] noteThreadDocs = new IDocument<NoteThread>[noteThreadDocIds.Count];
            var tasks = new List<Task>();
            for (int i = 0; i < noteThreadDocIds.Count; i++)
            {
                async Task fetchNoteThread(int index)
                {
                    noteThreadDocs[index] = await _conn.FetchAsync<NoteThread>(noteThreadDocIds[index]);
                }
                tasks.Add(fetchNoteThread(i));
            }
            await Task.WhenAll(tasks);
            return noteThreadDocs.ToDictionary(ntd => ntd.Data.DataId);
        }

        /// <summary>
        /// Apply the changes to a ParatextNoteThread doc.
        /// TODO: Handle if verseRef changes
        /// </summary>
        private async Task SubmitChangesOnNoteThreadDocAsync(
            IDocument<NoteThread> threadDoc,
            NoteThreadChange change,
            IReadOnlyDictionary<string, string> usernamesToUserIds
        )
        {
            if (change.ThreadRemoved)
            {
                await threadDoc.DeleteAsync();
                return;
            }

            await threadDoc.SubmitJson0OpAsync(op =>
            {
                // Update thread details
                if (change.ThreadUpdated)
                {
                    if (threadDoc.Data.Status != change.Status)
                        op.Set(td => td.Status, change.Status);
                    if (threadDoc.Data.TagIcon != change.TagIcon)
                        op.Set(td => td.TagIcon, change.TagIcon);
                    if (threadDoc.Data.Assignment != change.Assignment)
                        op.Set(td => td.Assignment, change.Assignment);
                }
                // Update content for updated notes
                foreach (Note updated in change.NotesUpdated)
                {
                    int index = threadDoc.Data.Notes.FindIndex(n => n.DataId == updated.DataId);
                    if (index >= 0)
                    {
                        if (threadDoc.Data.Notes[index].Content != updated.Content)
                            op.Set(td => td.Notes[index].Content, updated.Content);
                        if (threadDoc.Data.Notes[index].Status != updated.Status)
                            op.Set(td => td.Notes[index].Status, updated.Status);
                        if (threadDoc.Data.Notes[index].Type != updated.Type)
                            op.Set(td => td.Notes[index].Type, updated.Type);
                        if (threadDoc.Data.Notes[index].ConflictType != updated.ConflictType)
                            op.Set(td => td.Notes[index].ConflictType, updated.ConflictType);
                        if (threadDoc.Data.Notes[index].TagIcon != updated.TagIcon)
                            op.Set(td => td.Notes[index].TagIcon, updated.TagIcon);
                        if (threadDoc.Data.Notes[index].Assignment != updated.Assignment)
                            op.Set(td => td.Notes[index].Assignment, updated.Assignment);
                        if (threadDoc.Data.Notes[index].AcceptedChangeXml != updated.AcceptedChangeXml)
                            op.Set(td => td.Notes[index].AcceptedChangeXml, updated.AcceptedChangeXml);
                    }
                    else
                    {
                        string message = "Unable to update note in database with id: " + updated.DataId;
                        _logger.LogWarning(message);
                        LogMetric(message);
                    }
                }
                // Delete notes
                foreach (Note deleted in change.NotesDeleted)
                {
                    int index = threadDoc.Data.Notes.FindIndex(n => n.DataId == deleted.DataId);
                    if (index >= 0)
                    {
                        // The note can be easily removed by using op.Remove if that is preferred
                        op.Set(td => td.Notes[index].Deleted, true);
                    }
                    else
                    {
                        string message = "Unable to delete note in database with id: " + deleted.DataId;
                        _logger.LogWarning(message);
                        LogMetric(message);
                    }
                }

                // Add new notes, giving each note an associated SF userId if the user is also a Paratext user.
                foreach (Note added in change.NotesAdded)
                {
                    string ownerRef = null;
                    string username = string.IsNullOrEmpty(added.SyncUserRef)
                        ? null
                        : _currentPtSyncUsers.Values.Single(u => u.OpaqueUserId == added.SyncUserRef).Username;
                    if (username != null)
                        usernamesToUserIds.TryGetValue(username, out ownerRef);
                    added.OwnerRef = string.IsNullOrEmpty(ownerRef) ? _userSecret.Id : ownerRef;
                    op.Add(td => td.Notes, added);
                }

                // Permanently removes a note
                foreach (string removedId in change.NoteIdsRemoved)
                {
                    int index = threadDoc.Data.Notes.FindIndex(n => n.DataId == removedId);
                    if (index >= 0)
                        op.Remove(td => td.Notes, index);
                }

                if (change.Position != null)
                    op.Set(td => td.Position, change.Position);
            });
        }

        /// <summary>
        /// Preserve all whitespace in data but remove whitespace at the beginning of lines and remove line endings.
        /// </summary>
        private XElement ParseText(string text)
        {
            text = text.Trim().Replace("\r\n", "\n");
            text = Regex.Replace(text, @"\n\s*<", "<", RegexOptions.CultureInvariant);
            return XElement.Parse(text, LoadOptions.PreserveWhitespace);
        }

        /// <summary>
        /// Deletes all real-time questions docs from the database for a book.
        /// </summary>
        private async Task DeleteAllQuestionsDocsForBookAsync(TextInfo text)
        {
            List<string> questionDocIds = await _realtimeService
                .QuerySnapshots<Question>()
                .Where(q => q.ProjectRef == _projectDoc.Id && q.VerseRef.BookNum == text.BookNum)
                .Select(q => q.Id)
                .ToListAsync();
            var tasks = new List<Task>();
            foreach (string questionId in questionDocIds)
            {
                async Task deleteQuestion()
                {
                    IDocument<Question> questionDoc = await _conn.FetchAsync<Question>(questionId);
                    if (questionDoc.IsLoaded)
                        await questionDoc.DeleteAsync();
                }
                tasks.Add(deleteQuestion());
            }
            await Task.WhenAll(tasks);
            _syncMetrics.Questions.Deleted += questionDocIds.Count;
        }

        private async Task<List<string>> DeleteNoteThreadDocsInChapters(int bookNum, IEnumerable<Chapter> chapters)
        {
            IEnumerable<int> chaptersToDelete = chapters.Select(c => c.Number);
            IEnumerable<NoteThread> threadDocs = _realtimeService
                .QuerySnapshots<NoteThread>()
                .Where(n => n.ProjectRef == _projectDoc.Id && n.VerseRef.BookNum == bookNum);
            IEnumerable<string> noteThreadDocIds = threadDocs
                .Where(nt => chaptersToDelete.Contains(nt.VerseRef.ChapterNum))
                .Select(n => n.Id);
            // Make a record of the note thread doc ids to return since they are removed
            // from noteThreadDocIds after the docs are deleted.
            List<string> deletedNoteThreadDocIds = new List<string>(noteThreadDocIds);

            var tasks = new List<Task>();
            foreach (string noteThreadDocId in noteThreadDocIds)
            {
                async Task deleteNoteThread()
                {
                    IDocument<NoteThread> noteThreadDoc = await _conn.FetchAsync<NoteThread>(noteThreadDocId);
                    if (noteThreadDoc.IsLoaded)
                        await noteThreadDoc.DeleteAsync();
                }
                tasks.Add(deleteNoteThread());
            }

            await Task.WhenAll(tasks);
            _syncMetrics.NoteThreads.Deleted += deletedNoteThreadDocIds.Count;
            return deletedNoteThreadDocIds;
        }

        private async Task CompleteSync(
            bool successful,
            bool canRollbackParatext,
            bool trainEngine,
            CancellationToken token
        )
        {
            await NotifySyncProgress(SyncPhase.Phase6, 60.0);
            if (token.IsCancellationRequested)
            {
                Log($"CompleteSync: There was a cancellation request.");
            }
            if (_projectDoc == null || _projectSecret == null)
            {
                Log("CompleteSync: _projectDoc or _projectSecret are null. Rolling back SF DB transaction.");
                _conn.RollbackTransaction();
                return;
            }

            LogMetric("Completing sync");
            bool updateRoles = true;
            IReadOnlyDictionary<string, string> ptUserRoles;
            if (_paratextService.IsResource(_projectDoc.Data.ParatextId) || token.IsCancellationRequested)
            {
                // Do not update permissions on sync, if this is a resource project, as then,
                // permission updates will be performed when a target project is synchronized.
                // If the token is cancelled, do not update permissions as GetProjectRolesAsync will fail.
                ptUserRoles = new Dictionary<string, string>();
                updateRoles = false;
            }
            else
            {
                try
                {
                    ptUserRoles = await _paratextService.GetProjectRolesAsync(_userSecret, _projectDoc.Data, token);
                }
                catch (Exception ex)
                {
                    if (ex is HttpRequestException || ex is OperationCanceledException)
                    {
                        Log(
                            $"CompleteSync: Problem fetching project roles. Maybe the user does not have access to the project or cancelled the sync. ({ex})"
                        );
                        // This throws a 404 if the user does not have access to the project
                        // A task cancelled exception will be thrown if the user cancels the task
                        // Note: OperationCanceledException includes TaskCanceledException
                        ptUserRoles = new Dictionary<string, string>();
                        updateRoles = false;
                    }
                    else
                    {
                        Log($"CompleteSync: Problem fetching project roles. Rethrowing: ({ex})");
                        throw;
                    }
                }
            }

            var userIdsToRemove = new List<string>();
            var projectUsers = await _realtimeService
                .QuerySnapshots<User>()
                .Where(u => _projectDoc.Data.UserRoles.Keys.Contains(u.Id) && u.ParatextId != null)
                .Select(u => new { UserId = u.Id, ParatextId = u.ParatextId })
                .ToListAsync();

            bool dataInSync = true;
            if (!successful)
            {
                LogMetric("Restoring from backup");
                bool restoreSucceeded = false;
                // If we have failed, restore the repository, if we can
                if (canRollbackParatext)
                {
                    // If the restore is successful, then dataInSync will always be set to true because
                    // the restored repo can be assumed to be at the revision recorded in the project doc.
                    restoreSucceeded = _paratextService.RestoreRepository(_userSecret, _projectDoc.Data.ParatextId);
                    if (_syncMetrics != null)
                    {
                        _syncMetrics.RepositoryRestoredFromBackup = restoreSucceeded;
                    }
                }
                Log(
                    $"CompleteSync: Sync was not successful. {(restoreSucceeded ? "Rolled back" : "Failed to roll back")} local PT repo."
                );
                if (!restoreSucceeded)
                {
                    string repoVersion = _paratextService.GetLatestSharedVersion(
                        _userSecret,
                        _projectDoc.Data.ParatextId
                    );
                    dataInSync = repoVersion == _projectDoc.Data.Sync.SyncedToRepositoryVersion;
                }
            }

            // NOTE: This is executed outside of the transaction because it modifies "Sync.QueuedCount"
            await _projectDoc.SubmitJson0OpAsync(op =>
            {
                op.Set(pd => pd.Sync.LastSyncSuccessful, successful);

                // Get the latest shared revision of the local hg repo. On a failed synchronize attempt, the data
                // is known to be out of sync if the revision does not match the corresponding revision stored
                // on the project doc.
                string repoVersion = _paratextService.GetLatestSharedVersion(_userSecret, _projectDoc.Data.ParatextId);

                if (successful)
                {
                    Log($"CompleteSync: Successfully synchronized to PT repo commit id '{repoVersion}'.");
                    op.Set(pd => pd.Sync.DateLastSuccessfulSync, DateTime.UtcNow);
                    op.Set(pd => pd.Sync.SyncedToRepositoryVersion, repoVersion);
                    op.Set(pd => pd.Sync.DataInSync, true);
                }
                else
                {
                    Log(
                        $"CompleteSync: Failed to synchronize. PT repo latest shared version is '{repoVersion}'. SF DB project SyncedToRepositoryVersion is '{_projectDoc.Data.Sync.SyncedToRepositoryVersion}'."
                    );
                    op.Set(pd => pd.Sync.DataInSync, dataInSync);
                }
                // the frontend checks the queued count to determine if the sync is complete. The ShareDB client emits
                // an event for each individual op even if they are applied as a batch, so this needs to be set last,
                // otherwise the info about the sync won't be set yet when the frontend determines that the sync is
                // complete.
                if (_projectDoc.Data.Sync.QueuedCount > 0)
                {
                    op.Inc(pd => pd.Sync.QueuedCount, -1);
                }
                else
                {
                    Log(
                        $"CompleteSync: Warning: SF project id {_projectDoc.Id} QueuedCount is unexpectedly {_projectDoc.Data.Sync.QueuedCount}. Setting to 0 instead of decrementing."
                    );
                    op.Set(pd => pd.Sync.QueuedCount, 0);
                }

                if (updateRoles)
                {
                    // Only update the roles if we received information from Paratext
                    foreach (var projectUser in projectUsers)
                    {
                        if (ptUserRoles.TryGetValue(projectUser.ParatextId, out string role))
                            op.Set(p => p.UserRoles[projectUser.UserId], role);
                        else if (_projectDoc.Data.UserRoles[projectUser.UserId].StartsWith("pt"))
                            userIdsToRemove.Add(projectUser.UserId);
                    }
                }

                ParatextSettings settings = _paratextService.GetParatextSettings(
                    _userSecret,
                    _projectDoc.Data.ParatextId
                );
                if (settings != null)
                {
                    // See if the full name of the project needs updating
                    if (!string.IsNullOrEmpty(settings.FullName))
                    {
                        op.Set(pd => pd.Name, settings.FullName);
                    }

                    // Set the right-to-left language flag
                    op.Set(pd => pd.IsRightToLeft, settings.IsRightToLeft);
                    op.Set(pd => pd.Editable, settings.Editable);
                    op.Set(pd => pd.DefaultFont, settings.DefaultFont);
                    op.Set(pd => pd.DefaultFontSize, settings.DefaultFontSize);
                    op.Set(pd => pd.TagIcon, settings.TagIcon);
                }
                // The source can be null if there was an error getting a resource from the DBL
                if (TranslationSuggestionsEnabled && _projectDoc.Data.TranslateConfig.Source != null)
                {
                    ParatextSettings sourceSettings = _paratextService.GetParatextSettings(
                        _userSecret,
                        _projectDoc.Data.TranslateConfig.Source.ParatextId
                    );
                    if (sourceSettings != null)
                        op.Set(pd => pd.TranslateConfig.Source.IsRightToLeft, sourceSettings.IsRightToLeft);
                }
            });
            await NotifySyncProgress(SyncPhase.Phase6, 80.0);

            if (_syncMetrics != null)
            {
                _syncMetrics.Users.Deleted = userIdsToRemove.Count;
            }

            foreach (var userId in userIdsToRemove)
                await _projectService.RemoveUserWithoutPermissionsCheckAsync(_userSecret.Id, _projectDoc.Id, userId);

            // GetPTUsernameToSFUserIdsAsync will fail if the token is cancelled
            if (!token.IsCancellationRequested)
            {
                Dictionary<string, string> ptUsernamesToSFUserIds = await GetPTUsernameToSFUserIdsAsync(token);
                await _projectDoc.SubmitJson0OpAsync(op =>
                {
                    foreach (ParatextUserProfile activePtSyncUser in _currentPtSyncUsers.Values)
                    {
                        ParatextUserProfile existingUser = _projectDoc.Data.ParatextUsers.SingleOrDefault(
                            u => u.Username == activePtSyncUser.Username
                        );
                        if (existingUser == null)
                        {
                            if (ptUsernamesToSFUserIds.TryGetValue(activePtSyncUser.Username, out string userId))
                                activePtSyncUser.SFUserId = userId;
                            op.Add(pd => pd.ParatextUsers, activePtSyncUser);
                        }
                        else if (
                            existingUser.SFUserId == null
                            && ptUsernamesToSFUserIds.TryGetValue(existingUser.Username, out string userId)
                        )
                        {
                            int index = _projectDoc.Data.ParatextUsers.FindIndex(
                                u => u.Username == activePtSyncUser.Username
                            );
                            op.Set(pd => pd.ParatextUsers[index].SFUserId, userId);
                        }
                    }
                });
            }

            // If we have an id in the job ids collection, remove the first one, and/or if we have a
            // sync metrics id, we will remove that specific id from the project secrets.
            if (_projectSecret.JobIds.Any() || _projectSecret.SyncMetricsIds.Contains(_syncMetrics?.Id))
            {
                await _projectSecrets.UpdateAsync(
                    _projectSecret.Id,
                    u =>
                    {
                        if (_projectSecret.JobIds.Any())
                        {
                            u.Remove(p => p.JobIds, _projectSecret.JobIds.First());
                        }

                        if (_projectSecret.SyncMetricsIds.Contains(_syncMetrics?.Id))
                        {
                            u.Remove(p => p.SyncMetricsIds, _syncMetrics?.Id);
                        }
                    }
                );
            }

            // Commit or rollback the transaction, depending on success
            if (successful)
            {
                // Write the operations to the database
                await _conn.CommitTransactionAsync();

                // The project document and text documents must be committed before we can train the model
                bool hasSourceTextDocs = _projectDoc.Data.Texts.Any(t => t.HasSource);
                if (TranslationSuggestionsEnabled && trainEngine && hasSourceTextDocs)
                {
                    // Start training Machine engine
                    await _machineProjectService.BuildProjectAsync(_userSecret.Id, _projectDoc.Id, token);
                }

                // Backup the repository
                if (!_paratextService.IsResource(_projectDoc.Data.ParatextId))
                {
                    bool backupOutcome = _paratextService.BackupRepository(_userSecret, _projectDoc.Data.ParatextId);
                    if (_syncMetrics != null)
                    {
                        _syncMetrics.RepositoryBackupCreated = backupOutcome;
                    }

                    if (!backupOutcome)
                    {
                        Log($"CompleteSync: Failure backing up local PT repo.");
                    }
                }
            }
            else
            {
                // Rollback the operations (the repository was restored above)
                _conn.RollbackTransaction();
            }

            ReportRepoRevs("CompleteSync: ");

            if (_syncMetrics == null)
            {
                Log("The sync metrics were missing, and cannot be updated");
            }
            else
            {
                // _syncMetrics will be null if InitAsync() fails
                if (token.IsCancellationRequested)
                {
                    _syncMetrics.Status = SyncStatus.Cancelled;
                }
                else if (successful)
                {
                    _syncMetrics.Status = SyncStatus.Successful;
                }
                else
                {
                    _syncMetrics.Status = SyncStatus.Failed;
                }

                _syncMetrics.DateFinished = DateTime.UtcNow;
                if (!await _syncMetricsRepository.ReplaceAsync(_syncMetrics, true))
                {
                    Log("The sync metrics could not be updated in MongoDB");
                }
            }

            await NotifySyncProgress(SyncPhase.Phase6, 100.0);
            Log($"CompleteSync: Finished. Sync was {(successful ? "successful" : "unsuccessful")}.");
        }

        private void ReportRepoRevs(string prefix = "")
        {
            string projectPTId = _projectDoc.Data.ParatextId;
            string dbInfo =
                $"DB Sync.SyncedToRepositoryVersion: {_projectDoc.Data.Sync.SyncedToRepositoryVersion}, DB Sync.DataInSync: {_projectDoc.Data.Sync.DataInSync}.";
            if (_paratextService.IsResource(projectPTId))
            {
                Log($"{prefix}In-sync info: Is resource. {dbInfo}");
            }
            else if (!_paratextService.LocalProjectDirExists(projectPTId))
            {
                Log($"{prefix}In-sync info: No local hg repo. {dbInfo}");
            }
            else
            {
                string repoRev = _paratextService.GetRepoRevision(_userSecret, projectPTId);
                string sharedRev = _paratextService.GetLatestSharedVersion(_userSecret, projectPTId);
                Log(
                    $"{prefix}In-sync info: Local hg repo current rev: {repoRev}, Latest shared rev: {sharedRev}, {dbInfo}"
                );
            }
        }

        private async Task<Dictionary<string, string>> GetPTUsernameToSFUserIdsAsync(CancellationToken token)
        {
            IReadOnlyDictionary<string, string> idsToUsernames = await _paratextService.GetParatextUsernameMappingAsync(
                _userSecret,
                _projectDoc.Data,
                token
            );
            Dictionary<string, string> usernamesToUserIds = new Dictionary<string, string>();
            // Swap the keys and values
            foreach (KeyValuePair<string, string> kvp in idsToUsernames)
                usernamesToUserIds.Add(kvp.Value, kvp.Key);
            return usernamesToUserIds;
        }

        private IDocument<TextData> GetTextDoc(TextInfo text, int chapter)
        {
            return _conn.Get<TextData>(TextData.GetTextDocId(_projectDoc.Id, text.BookNum, chapter));
        }

        private async Task DeleteTextDocAsync(TextInfo text, int chapter)
        {
            IDocument<TextData> textDoc = GetTextDoc(text, chapter);
            await textDoc.FetchAsync();
            if (textDoc.IsLoaded)
                await textDoc.DeleteAsync();
        }

        private IDocument<NoteThread> GetNoteThreadDoc(string threadId)
        {
            return _conn.Get<NoteThread>($"{_projectDoc.Id}:{threadId}");
        }

        private Dictionary<int, ChapterDelta> GetDeltasByChapter(TextInfo text, string paratextId)
        {
            string bookText = _paratextService.GetBookText(_userSecret, paratextId, text.BookNum);
            XDocument usxDoc = XDocument.Parse(bookText);
            Dictionary<int, ChapterDelta> chapterDeltas = _deltaUsxMapper
                .ToChapterDeltas(usxDoc)
                .ToDictionary(cd => cd.Number);
            return chapterDeltas;
        }

        private async void SyncProgress_ProgressUpdated(object sender, EventArgs e)
        {
            if (_projectDoc == null)
            {
                return;
            }
            else if (sender is SyncProgress progress)
            {
                await NotifySyncProgress(SyncPhase.Phase3, progress.ProgressValue);
            }
        }

        private async Task NotifySyncProgress(SyncPhase syncPhase, double progress)
        {
            if (_projectDoc is not null)
            {
                await _hubContext.NotifySyncProgress(
                    _projectDoc.Id,
                    new ProgressState
                    {
                        // The fraction is based on the number of phases
                        ProgressValue =
                            1.0 / 6.0 * (double)syncPhase + (progress > 1.0 ? progress / 100.0 : progress) * 1.0 / 6.0,
                    }
                );
            }
        }

        private enum SyncPhase
        {
            Phase1 = 0, // Initial methods
            Phase2 = 1, // Update Paratext books and notes
            Phase3 = 2, // Paratext Sync
            Phase4 = 3, // Deleting texts and granting resource access
            Phase5 = 4, // Updating texts from Paratext books
            Phase6 = 5, // Final methods
        }

        private class ChapterEqualityComparer : IEqualityComparer<Chapter>
        {
            public bool Equals(Chapter x, Chapter y)
            {
                // We do not compare permissions, as these are modified in SFProjectService
                return x.Number == y.Number && x.LastVerse == y.LastVerse && x.IsValid == y.IsValid;
            }

            public int GetHashCode(Chapter obj)
            {
                int code = 23;
                code = code * 31 + obj.Number.GetHashCode();
                code = code * 31 + obj.LastVerse.GetHashCode();
                code = code * 31 + obj.IsValid.GetHashCode();
                return code;
            }
        }

        private void Log(string message, string? projectSFId = null, string? userId = null)
        {
            projectSFId ??= _projectDoc?.Id ?? "unknown";
            userId ??= _userSecret?.Id ?? "unknown";
            _logger.LogInformation($"SyncLog ({projectSFId} {userId}): {message}");
            LogMetric(message);
        }

        private void LogMetric(string message) => _syncMetrics.Log.Add($"{DateTime.UtcNow} {message}");
    }
}
