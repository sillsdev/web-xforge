using System;
using System.Collections.Generic;
using System.Linq;
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

namespace SIL.XForge.Scripture.Services;

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
/// 3. A note changelist is computed by diffing the real-time question docs and the notes in the local repo.
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
/// │SF DB├─→│Local│  │PT Archives│
/// │     │  │PT hg├─→│           │
/// │     │  │repo │  │           │
/// │     │  │     │←─┤           │
/// │     │←─┤     │  │           │
/// └─────┘  └─────┘  └───────────┘
/// </code>
/// </summary>
public class ParatextSyncRunner : IParatextSyncRunner
{
    private static readonly double _numberOfPhases = Enum.GetValues(typeof(SyncPhase)).Length;
    private static readonly IEqualityComparer<List<Chapter>> _chapterListEqualityComparer =
        SequenceEqualityComparer.Create(new ChapterEqualityComparer());
    private static readonly IEqualityComparer<IList<string>> _listStringComparer = SequenceEqualityComparer.Create(
        EqualityComparer<string>.Default
    );
    private static readonly IEqualityComparer<IList<int>> _listIntComparer = SequenceEqualityComparer.Create(
        EqualityComparer<int>.Default
    );
    private static readonly IEqualityComparer<IEnumerable<NoteTag>> _noteTagListEqualityComparer =
        SequenceEqualityComparer.Create(new NoteTagEqualityComparer());

    /// <summary>
    /// The regular expression for finding whitespace before XML tags.
    /// </summary>
    /// <remarks>This is used by <see cref="ParseText"/>.</remarks>
    private static readonly Regex WhitespaceBeforeTagsRegex = new Regex(
        @"\n\s*<",
        RegexOptions.CultureInvariant | RegexOptions.Compiled
    );

    private readonly IRepository<UserSecret> _userSecrets;
    private readonly IUserService _userService;
    private readonly IRepository<SFProjectSecret> _projectSecrets;
    private readonly IRepository<SyncMetrics> _syncMetricsRepository;
    private readonly ISFProjectService _projectService;
    private readonly IParatextService _paratextService;
    private readonly IRealtimeService _realtimeService;
    private readonly IDeltaUsxMapper _deltaUsxMapper;
    private readonly IParatextNotesMapper _notesMapper;
    private readonly ILogger<ParatextSyncRunner> _logger;
    private readonly IGuidService _guidService;
    private readonly IHubContext<NotificationHub, INotifier> _hubContext;

    private IConnection _conn;
    private UserSecret _userSecret;
    private IDocument<SFProject> _projectDoc;
    private SFProjectSecret _projectSecret;
    internal SyncMetrics _syncMetrics;
    private Dictionary<string, ParatextUserProfile> _currentPtSyncUsers;
    private Dictionary<string, string> _userIdsToDisplayNames;
    private IReadOnlyList<ParatextProjectUser> _paratextUsers = [];

    public ParatextSyncRunner(
        IRepository<UserSecret> userSecrets,
        IUserService userService,
        IRepository<SFProjectSecret> projectSecrets,
        IRepository<SyncMetrics> syncMetricsRepository,
        ISFProjectService projectService,
        IParatextService paratextService,
        IRealtimeService realtimeService,
        IDeltaUsxMapper deltaUsxMapper,
        IParatextNotesMapper notesMapper,
        IHubContext<NotificationHub, INotifier> hubContext,
        ILogger<ParatextSyncRunner> logger,
        IGuidService guidService
    )
    {
        _userSecrets = userSecrets;
        _userService = userService;
        _projectSecrets = projectSecrets;
        _syncMetricsRepository = syncMetricsRepository;
        _projectService = projectService;
        _paratextService = paratextService;
        _realtimeService = realtimeService;
        _logger = logger;
        _deltaUsxMapper = deltaUsxMapper;
        _notesMapper = notesMapper;
        _guidService = guidService;
        _hubContext = hubContext;
        _guidService = guidService;
    }

    private bool CheckingEnabled => _projectDoc.Data.CheckingConfig.CheckingEnabled;

    /// <summary>
    /// Synchronize content and user permissions in SF DB with Paratext SendReceive servers and PT Registry, for
    /// a project.
    /// </summary>
    /// <param name="projectSFId">The project's Scripture Forge identifier.</param>
    /// <param name="userId">The user identifier.</param>
    /// <param name="syncMetricsId">The sync metrics identifier.</param>
    /// <param name="trainEngine">No longer used. This is kept to ensure backwards compatibility with previously created jobs.</param>
    /// <param name="token">The cancellation token.</param>
    /// <remarks>
    /// Do not allow multiple sync jobs to run in parallel on the same project by creating a hangfire mutex that
    /// restricts the execution of this method as a background job to one instance at a time.
    /// </remarks>
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
                await CompleteSync(false, canRollbackParatext, token);
                return;
            }

            // Remove the parallel deserializer
            _paratextService.InitializeCommentManager(_userSecret, _projectDoc.Data.ParatextId);

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
                    Log($"RunAsync: There wasn't already a local PT repo backup, so we tried to make one but failed.");
                }
            }

            ReportRepoRevs();
            await NotifySyncProgress(SyncPhase.Phase1, 90.0);

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
            var noteThreadDocsByBook = new Dictionary<int, IEnumerable<IDocument<NoteThread>>>();
            var biblicalTermDocs = new List<IDocument<BiblicalTerm>>();
            var biblicalTermNoteThreadDocs = new List<IDocument<NoteThread>>();

            // Update target Paratext books, notes and biblical terms, if this is not a resource
            if (!_paratextService.IsResource(targetParatextId))
            {
                await GetAndUpdateParatextBooksAndNotes(
                    SyncPhase.Phase2,
                    targetParatextId,
                    targetTextDocsByBook,
                    questionDocsByBook,
                    noteThreadDocsByBook,
                    biblicalTermNoteThreadDocs
                );
                biblicalTermDocs = await GetAndUpdateParatextBiblicalTerms(
                    SyncPhase.Phase3,
                    targetParatextId,
                    biblicalTermDocs
                );
            }

            // Check for cancellation
            if (token.IsCancellationRequested)
            {
                await CompleteSync(false, canRollbackParatext, token);
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
                    token,
                    _syncMetrics
                );
                Log($"RunAsync: ParatextData SendReceive finished without throwing.");
            }
            finally
            {
                // Deregister the handler
                progress.ProgressUpdated -= SyncProgress_ProgressUpdated;
            }

            await NotifySyncProgress(SyncPhase.Phase5, 30.0);

            // Check for cancellation
            if (token.IsCancellationRequested)
            {
                await CompleteSync(false, canRollbackParatext, token);
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
                await CompleteSync(false, canRollbackParatext, token);
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

            await NotifySyncProgress(SyncPhase.Phase5, 60.0);

            // Check for cancellation
            if (token.IsCancellationRequested)
            {
                await CompleteSync(false, canRollbackParatext, token);
                return;
            }

            // Update user resource access, if this project has a source resource
            // The updating of a source project's permissions is done when that project is synced.
            if (
                !string.IsNullOrWhiteSpace(sourceParatextId)
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

                    // Add new PT users who are in the target project, but not the source project
                    List<string> usersToAdd =
                    [
                        .. _projectDoc
                            .Data.UserRoles.Where(u => SFProjectRole.IsParatextRole(u.Value))
                            .Select(u => u.Key)
                            .Except(sourceProject.Data.UserRoles.Keys),
                    ];
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

                    // Remove PT users who are in the target project, and no longer have access to the resource
                    List<string> usersToCheck =
                    [
                        .. _projectDoc
                            .Data.UserRoles.Where(u => SFProjectRole.IsParatextRole(u.Value))
                            .Select(u => u.Key)
                            .Except(usersToAdd),
                    ];
                    foreach (string uid in usersToCheck)
                    {
                        string permission = await _paratextService.GetResourcePermissionAsync(
                            sourceParatextId,
                            uid,
                            token
                        );
                        if (permission == TextInfoPermission.None)
                        {
                            await _projectService.RemoveUserWithoutPermissionsCheckAsync(uid, sourceProjectRef, uid);
                            _syncMetrics.ResourceUsers.Deleted++;
                        }
                    }
                }
            }

            await NotifySyncProgress(SyncPhase.Phase5, 90.0);

            bool resourceNeedsUpdating =
                paratextProject is ParatextResource paratextResource
                && _paratextService.ResourceDocsNeedUpdating(_projectDoc.Data, paratextResource);
            if (paratextProject is ParatextResource)
                LogMetric($"Resource needs updating: {resourceNeedsUpdating}");

            // If a resource needs updating, retrieve the books, as they were not retrieved previously
            if (resourceNeedsUpdating)
            {
                await GetAndUpdateParatextBooksAndNotes(
                    SyncPhase.Phase6,
                    targetParatextId,
                    targetTextDocsByBook,
                    questionDocsByBook,
                    noteThreadDocsByBook,
                    biblicalTermNoteThreadDocs
                );
            }

            if (!_paratextService.IsResource(targetParatextId) || resourceNeedsUpdating)
            {
                await UpdateDocsAsync(
                    SyncPhase.Phase7,
                    targetParatextId,
                    targetTextDocsByBook,
                    questionDocsByBook,
                    noteThreadDocsByBook,
                    targetBooks,
                    sourceBooks
                );
                await UpdateBiblicalTermsAsync(
                    SyncPhase.Phase8,
                    targetParatextId,
                    biblicalTermDocs,
                    biblicalTermNoteThreadDocs
                );
            }
            LogMetric("Back from UpdateDocsAsync");
            await NotifySyncProgress(SyncPhase.Phase9, 20.0);

            // Check for cancellation
            if (token.IsCancellationRequested)
            {
                await CompleteSync(false, canRollbackParatext, token);
                return;
            }

            // Update the resource configuration
            if (resourceNeedsUpdating)
            {
                LogMetric("Updating resource config");
                await UpdateResourceConfig(paratextProject);
            }

            // Update permissions if not a resource, or if it is a resource and needs updating.
            // A resource will need updating if its text or permissions have changed on the DBL.
            // Source resources have their permissions updated above in the section "Updating user resource access".
            if (!_paratextService.IsResource(targetParatextId) || resourceNeedsUpdating)
            {
                LogMetric("Updating permissions");
                await _projectService.UpdatePermissionsAsync(userId, _projectDoc, _paratextUsers, token);
            }

            await NotifySyncProgress(SyncPhase.Phase9, 40.0);

            // Check for cancellation
            if (token.IsCancellationRequested)
            {
                await CompleteSync(false, canRollbackParatext, token);
                return;
            }

            await CompleteSync(true, canRollbackParatext, token);
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

            await CompleteSync(false, canRollbackParatext, token);
        }
        finally
        {
            CloseConnection();
        }
    }

    /// <summary>
    /// Retrieves the texts and questions from the Realtime server, and updates the Paratext repository if the
    /// project is not a Paratext resource. Both of the dictionaries <paramref name="textDocsByBook"/> and
    /// <paramref name="questionDocsByBook"/> are populated by this method.
    /// </summary>
    /// <param name="syncPhase">The sync phase.</param>
    /// <param name="paratextId">The Paratext ID.</param>
    /// <param name="textDocsByBook">The text documents with the book number as key.</param>
    /// <param name="questionDocsByBook">The question documents with the book number as key.</param>
    /// <param name="noteThreadDocsByBook">The note thread documents with the book number as key.</param>
    /// <param name="biblicalTermNoteThreadDocs">The note thread documents for the Biblical Terms</param>
    /// <returns>The task.</returns>
    /// <exception cref="ArgumentException">The Paratext project repository does not exist.</exception>
    private async Task GetAndUpdateParatextBooksAndNotes(
        SyncPhase syncPhase,
        string paratextId,
        IDictionary<int, SortedList<int, IDocument<TextData>>> textDocsByBook,
        IDictionary<int, IReadOnlyList<IDocument<Question>>> questionDocsByBook,
        IDictionary<int, IEnumerable<IDocument<NoteThread>>> noteThreadDocsByBook,
        List<IDocument<NoteThread>> biblicalTermNoteThreadDocs
    )
    {
        // Get the Text Data
        List<string> textIds =
        [
            .. _projectDoc.Data.Texts.SelectMany(t =>
                t.Chapters.Select(c => TextData.GetTextDocId(_projectDoc.Id, t.BookNum, c.Number))
            ),
        ];
        IReadOnlyCollection<IDocument<TextData>> textDocs = await _conn.GetAndFetchDocsAsync<TextData>(textIds);

        // Get the Note Threads
        List<string> noteIds = await _realtimeService
            .QuerySnapshots<NoteThread>()
            .Where(pnt => pnt.ProjectRef == _projectDoc.Id)
            .Select(pnt => pnt.Id)
            .ToListAsync();
        IReadOnlyCollection<IDocument<NoteThread>> noteDocs = await _conn.GetAndFetchDocsAsync<NoteThread>(noteIds);

        // Get the Questions
        List<string> questionIds = await _realtimeService
            .QuerySnapshots<Question>()
            .Where(q => q.ProjectRef == _projectDoc.Id)
            .Select(q => q.Id)
            .ToListAsync();
        IReadOnlyCollection<IDocument<Question>> questionDocs = await _conn.GetAndFetchDocsAsync<Question>(questionIds);

        ParatextSettings? settings = _paratextService.GetParatextSettings(_userSecret, paratextId);
        double i = 0.0;
        foreach (TextInfo text in _projectDoc.Data.Texts)
        {
            i++;

            await NotifySyncProgress(syncPhase, i / _projectDoc.Data.Texts.Count);

            // We check for settings in the loop, because if there are no texts, we would expect it to be null
            if (settings == null)
            {
                throw new ArgumentException("FAILED: Attempting to write to a project repository that does not exist.");
            }

            LogMetric($"Getting Paratext book {text.BookNum}");
            SortedList<int, IDocument<TextData>> targetTextDocs = GetTextDocsForBook(text, textDocs);
            textDocsByBook[text.BookNum] = targetTextDocs;
            if (settings.Editable && !_paratextService.IsResource(paratextId))
            {
                LogMetric("Updating Paratext book");
                await UpdateParatextBookAsync(text, paratextId, targetTextDocs);
            }

            questionDocsByBook[text.BookNum] = questionDocs
                .Where(q => q.Data.VerseRef.BookNum == text.BookNum)
                .ToList();
            if (!_paratextService.IsResource(paratextId))
            {
                LogMetric("Updating Paratext notes for questions");
                if (questionDocsByBook[text.BookNum].Count > 0)
                {
                    await UpdateParatextNotesAsync(text, questionDocsByBook[text.BookNum]);
                }

                List<IDocument<NoteThread>> noteThreadDocs =
                [
                    .. noteDocs.Where(n => n.Data?.VerseRef.BookNum == text.BookNum && n.Data?.BiblicalTermId == null),
                ];
                noteThreadDocsByBook[text.BookNum] = noteThreadDocs;
            }
        }

        // Update the notes for all books if this is not a resource
        LogMetric("Updating Paratext notes");
        if (!_paratextService.IsResource(paratextId))
        {
            // Only update the note tag if there are SF note threads in the project
            if (noteDocs.Any(nt => nt.Data.PublishedToSF == true && nt.Data?.BiblicalTermId == null))
                await UpdateTranslateNoteTag(paratextId);

            // Only update Paratext if there are editable notes
            List<IDocument<NoteThread>> editableNotes =
            [
                .. noteDocs.Where(nt => nt.Data.Notes.Any(n => n.Editable == true) && nt.Data?.BiblicalTermId == null),
            ];
            if (editableNotes.Count > 0)
            {
                int sfNoteTagId = _projectDoc.Data.TranslateConfig.DefaultNoteTagId ?? NoteTag.notSetId;
                _syncMetrics.ParatextNotes += await _paratextService.UpdateParatextCommentsAsync(
                    _userSecret,
                    paratextId,
                    editableNotes,
                    _userIdsToDisplayNames,
                    _currentPtSyncUsers,
                    sfNoteTagId
                );
            }
        }

        // Get notes for Biblical Terms
        LogMetric("Retrieving notes for Biblical Terms");
        biblicalTermNoteThreadDocs.AddRange(noteDocs.Where(n => n.Data?.BiblicalTermId != null));

        // If biblical terms is not enabled, we do not want to sync an empty list, as it will remove any biblical term notes
        if (!_projectDoc.Data.BiblicalTermsConfig.BiblicalTermsEnabled && biblicalTermNoteThreadDocs.Count == 0)
        {
            return;
        }

        // Update the biblical term notes, if this is not a resource
        if (!_paratextService.IsResource(paratextId))
        {
            _syncMetrics.ParatextNotes += await _paratextService.UpdateParatextCommentsAsync(
                _userSecret,
                paratextId,
                biblicalTermNoteThreadDocs,
                _userIdsToDisplayNames,
                _currentPtSyncUsers,
                NoteTag.biblicalTermsId
            );
        }
    }

    private async Task<List<IDocument<BiblicalTerm>>> GetAndUpdateParatextBiblicalTerms(
        SyncPhase syncPhase,
        string paratextId,
        List<IDocument<BiblicalTerm>> biblicalTermDocs
    )
    {
        LogMetric("Getting Paratext biblical terms");
        await NotifySyncProgress(syncPhase, 0);
        BiblicalTermsChanges biblicalTermsChanges = await _paratextService.GetBiblicalTermsAsync(
            _userSecret,
            paratextId,
            _projectDoc.Data.Texts.Select(t => t.BookNum)
        );

        // Get the biblical terms from the database
        LogMetric("Getting Scripture Forge biblical terms");
        await NotifySyncProgress(syncPhase, 25);
        biblicalTermDocs.Clear();
        biblicalTermDocs.AddRange(await FetchBiblicalTermDocsAsync());

        // If the user had an error, but there are already Biblical Terms, just leave them as is.
        // We should record the error but not disable biblical terms
        if (!string.IsNullOrWhiteSpace(biblicalTermsChanges.ErrorMessage))
        {
            await _projectDoc.SubmitJson0OpAsync(op =>
            {
                op.Set(p => p.BiblicalTermsConfig.ErrorMessage, biblicalTermsChanges.ErrorMessage);
                op.Set(p => p.BiblicalTermsConfig.HasRenderings, biblicalTermsChanges.HasRenderings);

                // If there are no Biblical Terms or Renderings, disable Biblical Terms
                if (!biblicalTermDocs.Any())
                {
                    op.Set(p => p.BiblicalTermsConfig.BiblicalTermsEnabled, false);
                }
            });
            return biblicalTermDocs;
        }

        // Update the renderings
        LogMetric("Updating Paratext biblical terms");
        await NotifySyncProgress(syncPhase, 50);
        double i = 0.0;
        List<BiblicalTerm> biblicalTermsToUpdate = [];
        foreach (IDocument<BiblicalTerm> biblicalTermDoc in biblicalTermDocs)
        {
            i++;
            await NotifySyncProgress(syncPhase, 50 + (i / biblicalTermDocs.Count / 3));
            BiblicalTerm? biblicalTerm = biblicalTermsChanges.BiblicalTerms.FirstOrDefault(b =>
                b.TermId == biblicalTermDoc.Data.TermId
            );
            if (
                biblicalTerm is not null
                && (
                    !biblicalTerm.Renderings.SequenceEqual(biblicalTermDoc.Data.Renderings)
                    || biblicalTerm.Description != biblicalTermDoc.Data.Description
                )
            )
            {
                biblicalTerm.Renderings = biblicalTermDoc.Data.Renderings;
                biblicalTerm.Description = biblicalTermDoc.Data.Description;
                biblicalTermsToUpdate.Add(biblicalTerm);
            }
        }

        LogMetric("Saving Paratext biblical terms");
        await NotifySyncProgress(syncPhase, 75);
        _syncMetrics.ParatextBiblicalTerms += _paratextService.UpdateBiblicalTerms(
            _userSecret,
            paratextId,
            biblicalTermsToUpdate
        );
        return biblicalTermDocs;
    }

    private async Task UpdateBiblicalTermsAsync(
        SyncPhase syncPhase,
        string paratextId,
        IReadOnlyCollection<IDocument<BiblicalTerm>> biblicalTermDocs,
        IEnumerable<IDocument<NoteThread>> biblicalTermNoteThreadDocs
    )
    {
        LogMetric("Updating Biblical Terms thread docs");
        await UpdateNoteThreadDocsAsync(null, biblicalTermNoteThreadDocs.ToDictionary(nt => nt.Data.DataId), []);

        LogMetric("Getting Paratext biblical terms");
        await NotifySyncProgress(syncPhase, 0);
        BiblicalTermsChanges biblicalTermsChanges = await _paratextService.GetBiblicalTermsAsync(
            _userSecret,
            paratextId,
            _projectDoc.Data.Texts.Select(t => t.BookNum)
        );

        // If the user had an error, but there are already Biblical Terms, just leave them as is.
        // We should record the error but not disable biblical terms
        if (!string.IsNullOrWhiteSpace(biblicalTermsChanges.ErrorMessage))
        {
            await _projectDoc.SubmitJson0OpAsync(op =>
            {
                op.Set(p => p.BiblicalTermsConfig.ErrorMessage, biblicalTermsChanges.ErrorMessage);
                op.Set(p => p.BiblicalTermsConfig.HasRenderings, biblicalTermsChanges.HasRenderings);
            });
            return;
        }
        else
        {
            await _projectDoc.SubmitJson0OpAsync(op =>
            {
                op.Unset(p => p.BiblicalTermsConfig.ErrorMessage);
                op.Set(p => p.BiblicalTermsConfig.HasRenderings, biblicalTermsChanges.HasRenderings);
            });
        }

        var tasks = new List<Task>();

        // Add and Update existing terms
        LogMetric("Updating biblical terms");
        double i = 0.0;
        foreach (BiblicalTerm biblicalTerm in biblicalTermsChanges.BiblicalTerms)
        {
            i++;
            await NotifySyncProgress(syncPhase, i / biblicalTermsChanges.BiblicalTerms.Count);
            IDocument<BiblicalTerm>? biblicalTermDoc = biblicalTermDocs.FirstOrDefault(b =>
                b.Data.TermId == biblicalTerm.TermId
            );
            if (biblicalTermDoc is null)
            {
                // Add the document
                biblicalTerm.DataId = _guidService.NewObjectId();
                biblicalTerm.ProjectRef = _projectDoc.Id;
                IDocument<BiblicalTerm> newBiblicalTermDoc = GetBiblicalTermDoc(biblicalTerm.DataId);
                async Task CreateBiblicalTermAsync(BiblicalTerm newBiblicalTerm) =>
                    await newBiblicalTermDoc.CreateAsync(newBiblicalTerm);
                tasks.Add(CreateBiblicalTermAsync(biblicalTerm));
                _syncMetrics.BiblicalTerms.Added++;
            }
            else
            {
                // Update the document
                tasks.Add(
                    biblicalTermDoc.SubmitJson0OpAsync(op =>
                    {
                        op.Set(b => b.Transliteration, biblicalTerm.Transliteration);
                        op.Set(b => b.Renderings, biblicalTerm.Renderings, _listStringComparer);
                        op.Set(b => b.Description, biblicalTerm.Description);
                        op.Set(b => b.Language, biblicalTerm.Language);
                        op.Set(b => b.Links, biblicalTerm.Links, _listStringComparer);
                        op.Set(b => b.References, biblicalTerm.References, _listIntComparer);

                        // Add/Update definitions
                        foreach ((string language, BiblicalTermDefinition definition) in biblicalTerm.Definitions)
                        {
                            if (
                                biblicalTermDoc.Data.Definitions.TryGetValue(
                                    language,
                                    out BiblicalTermDefinition existingDefinition
                                )
                            )
                            {
                                if (!_listStringComparer.Equals(existingDefinition.Categories, definition.Categories))
                                {
                                    op.Set(b => b.Definitions[language].Categories, definition.Categories);
                                }

                                if (!_listStringComparer.Equals(existingDefinition.Domains, definition.Domains))
                                {
                                    op.Set(b => b.Definitions[language].Domains, definition.Domains);
                                }

                                if (existingDefinition.Gloss != definition.Gloss)
                                {
                                    op.Set(b => b.Definitions[language].Gloss, definition.Gloss);
                                }

                                if (existingDefinition.Notes != definition.Notes)
                                {
                                    op.Set(b => b.Definitions[language].Notes, definition.Notes);
                                }
                            }
                            else
                            {
                                op.Set(b => b.Definitions[language], definition);
                            }
                        }

                        // Remove missing definitions
                        foreach (
                            (string language, _) in biblicalTermDoc.Data.Definitions.Where(d =>
                                !biblicalTerm.Definitions.ContainsKey(d.Key)
                            )
                        )
                        {
                            op.Unset(b => b.Definitions[language]);
                        }
                    })
                );

                _syncMetrics.BiblicalTerms.Updated++;
            }
        }

        // Remove missing biblical terms
        foreach (
            IDocument<BiblicalTerm> biblicalTermDoc in biblicalTermDocs.Where(doc =>
                !biblicalTermsChanges.BiblicalTerms.Select(b => b.TermId).Contains(doc.Data.TermId)
            )
        )
        {
            tasks.Add(biblicalTermDoc.DeleteAsync());
            _syncMetrics.BiblicalTerms.Deleted++;
        }

        await Task.WhenAll(tasks);
    }

    private IDocument<BiblicalTerm> GetBiblicalTermDoc(string dataId) =>
        _conn.Get<BiblicalTerm>($"{_projectDoc.Id}:{dataId}");

    /// <summary>
    /// Updates the resource configuration
    /// </summary>
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
                await _projectDoc.SubmitJson0OpAsync(op =>
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
        SyncPhase syncPhase,
        string targetParatextId,
        Dictionary<int, SortedList<int, IDocument<TextData>>> targetTextDocsByBook,
        Dictionary<int, IReadOnlyList<IDocument<Question>>> questionDocsByBook,
        Dictionary<int, IEnumerable<IDocument<NoteThread>>> noteThreadDocsByBook,
        HashSet<int> targetBooks,
        HashSet<int> sourceBooks
    )
    {
        // update source and target real-time docs
        double i = 0.0;
        foreach (int bookNum in targetBooks)
        {
            i++;
            await NotifySyncProgress(syncPhase, i / targetBooks.Count);
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
                !targetTextDocsByBook.TryGetValue(text.BookNum, out SortedList<int, IDocument<TextData>> targetTextDocs)
            )
            {
                targetTextDocs = [];
            }

            LogMetric("Updating text docs - get deltas");
            Dictionary<int, ChapterDelta> chapterDeltas = GetParatextChaptersAsDeltas(text, targetParatextId);

            LogMetric("Updating text docs");
            List<Chapter> newSetOfChapters = await UpdateTextDocsAsync(text, targetTextDocs, chapterDeltas);

            // update question docs
            if (questionDocsByBook.TryGetValue(text.BookNum, out IReadOnlyList<IDocument<Question>> questionDocs))
            {
                LogMetric("Updating question docs");
                await UpdateQuestionDocsAsync(questionDocs, newSetOfChapters);
            }

            LogMetric("Updating thread docs - updating");

            // update note thread docs
            if (!noteThreadDocsByBook.TryGetValue(text.BookNum, out IEnumerable<IDocument<NoteThread>> noteThreadDocs))
            {
                noteThreadDocs = Array.Empty<IDocument<NoteThread>>();
            }
            await UpdateNoteThreadDocsAsync(
                text.BookNum,
                noteThreadDocs.ToDictionary(nt => nt.Data.DataId),
                chapterDeltas
            );

            // update project metadata
            LogMetric("Updating project metadata");
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

        // If there was a sync prior to this one
        if (_syncMetrics.DateStarted is not null)
        {
            // Record the previous sync in clean sync metrics record with the same id
            _syncMetrics = new SyncMetrics
            {
                DateQueued = _syncMetrics.DateQueued,
                Id = _syncMetrics.Id,
                ProjectRef = _syncMetrics.ProjectRef,
                Status = SyncStatus.Queued,
                UserRef = _syncMetrics.UserRef,
                PreviousSyncs = [.. _syncMetrics.PreviousSyncs ?? [], _syncMetrics with { PreviousSyncs = [] }],
            };
        }

        // Set the sync metrics
        _syncMetrics.ProductVersion = Product.Version;
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
        _conn.ExcludePropertyFromTransaction<SFProject>(op => op.Sync.LastSyncSuccessful);
        _conn.ExcludePropertyFromTransaction<SFProject>(op => op.Sync.LastSyncErrorCode);
        _projectDoc = await _conn.FetchAsync<SFProject>(projectSFId);
        if (!_projectDoc.IsLoaded)
        {
            Log($"Project doc was not loaded.", projectSFId, userId);
            return false;
        }

        await NotifySyncProgress(SyncPhase.Phase1, 30.0);

        if (!(await _projectSecrets.TryGetAsync(projectSFId)).TryResult(out _projectSecret))
        {
            Log($"Could not find project secret.", projectSFId, userId);
            return false;
        }
        _userIdsToDisplayNames = await _userService.DisplayNamesFromUserIds(
            userId,
            [.. _projectDoc.Data.UserRoles.Keys]
        );

        if (!(await _userSecrets.TryGetAsync(userId)).TryResult(out _userSecret))
        {
            Log($"Could not find user secret.", projectSFId, userId);
            return false;
        }

        // Report on authentication success before other attempts.
        await PreflightAuthenticationReportAsync();

        try
        {
            _paratextUsers = await _paratextService.GetParatextUsersAsync(_userSecret, _projectDoc.Data, token);
        }
        catch (ForbiddenException)
        {
            Log($"User does not have permission to sync project {projectSFId}.", projectSFId, userId);
            await _projectDoc.SubmitJson0OpAsync(op =>
                op.Set(pd => pd.Sync.LastSyncErrorCode, (int)SyncErrorCodes.UserPermissionError)
            );
            return false;
        }

        _currentPtSyncUsers = GetCurrentProjectPtUsers();

        _notesMapper.Init(_userSecret, _paratextUsers);

        await NotifySyncProgress(SyncPhase.Phase1, 60.0);
        return true;
    }

    internal void CloseConnection() => _conn?.Dispose();

    /// <summary>
    /// Returns an XDocument for the USX of a book in a Paratext project repo.
    /// </summary>
    internal XDocument GetBookUsx(string ptProjectId, int bookNum)
    {
        string bookUsx = _paratextService.GetBookText(_userSecret, ptProjectId, bookNum);
        return UsxToXDocument(bookUsx);
    }

    internal static XDocument UsxToXDocument(string bookUsx)
    {
        // XDocument.Parse() is sensitive to whether it perceives the input as indented. It also seems to lack
        // flexibility in what whitespace is preserved. We need to preserve some whitespace so USX like
        // "<char>In</char> <char>the</char>" does not lose the space between "char" elements. But we don't want to
        // preserve other whitespace, like indentation, or newlines between elements, which then get into the
        // text docs. Therefore, process the USX to remove undesired whitespace, while leaving desired whitespace
        // intact, and request XDocument.Parse to preserve whitespace.

        // Remove whitespace at the beginning of the text.
        bookUsx = Regex.Replace(bookUsx, @"^\s*", "", RegexOptions.CultureInvariant);
        // Remove whitespace at the beginning of the rest of the lines, and remove line breaks.
        bookUsx = Regex.Replace(bookUsx, @"\r?\n\s*", "", RegexOptions.CultureInvariant);

        // When the input to XDocument.Parse is one line with no initial whitespace, it does perceive this input
        // as "indented", and so honours the request to preserve whitespace.
        return XDocument.Parse(bookUsx, LoadOptions.PreserveWhitespace);
    }

    ///<summary>Apply changes in text docs to Paratext project repo.</summary>
    internal async Task UpdateParatextBookAsync(
        TextInfo text,
        string paratextId,
        SortedList<int, IDocument<TextData>> textDocs
    )
    {
        XDocument oldUsxDoc = GetBookUsx(paratextId, text.BookNum);
        XDocument newUsxDoc = _deltaUsxMapper.ToUsx(
            oldUsxDoc,
            text.Chapters.OrderBy(c => c.Number)
                .Select(c => new ChapterDelta(c.Number, c.LastVerse, c.IsValid, textDocs[c.Number].Data))
        );

        if (!XNode.DeepEquals(oldUsxDoc, newUsxDoc))
        {
            var chapterAuthors = await GetChapterAuthorsAsync(text, textDocs);
            _syncMetrics.ParatextBooks.Updated += await _paratextService.PutBookText(
                _userSecret,
                paratextId,
                text.BookNum,
                newUsxDoc,
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
                        userSFId = _projectDoc
                            .Data.UserRoles.FirstOrDefault(p => p.Value == SFProjectRole.Administrator)
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

        if (
            _projectDoc.Data.CheckingConfig.NoteTagId == null
            && _projectDoc.Data.CheckingConfig.AnswerExportMethod != CheckingAnswerExport.None
        )
        {
            bool hasExportableAnswers =
                (
                    _projectDoc.Data.CheckingConfig.AnswerExportMethod == CheckingAnswerExport.All
                    && questionDocs.Any(q => q.Data.Answers.Count > 0)
                ) || questionDocs.Any(q => q.Data.Answers.Any(a => a.Status == AnswerStatus.Exportable));
            if (hasExportableAnswers)
                await UpdateCheckingNoteTag(_projectDoc.Data.ParatextId);
        }

        XElement notesElem = await _notesMapper.GetNotesChangelistAsync(
            oldNotesElem,
            questionDocs,
            _currentPtSyncUsers,
            _projectDoc.Data.UserRoles,
            _projectDoc.Data.CheckingConfig.AnswerExportMethod,
            _projectDoc.Data.CheckingConfig.NoteTagId ?? NoteTag.notSetId
        );

        if (notesElem.Elements("thread").Any())
        {
            _syncMetrics.ParatextNotes += _paratextService.PutNotes(
                _userSecret,
                _projectDoc.Data.ParatextId,
                notesElem
            );
        }
    }

    private async Task<List<Chapter>> UpdateTextDocsAsync(
        TextInfo text,
        SortedList<int, IDocument<TextData>> textDocs,
        Dictionary<int, ChapterDelta> chapterDeltas
    )
    {
        var tasks = new List<Task>();
        var chapters = new List<Chapter>();
        foreach (KeyValuePair<int, ChapterDelta> kvp in chapterDeltas)
        {
            if (textDocs.TryGetValue(kvp.Key, out IDocument<TextData> textDataDoc))
            {
                Delta diffDelta = textDataDoc.Data.Diff(kvp.Value.Delta);
                if (diffDelta.Ops.Count > 0)
                {
                    tasks.Add(textDataDoc.SubmitOpAsync(diffDelta, OpSource.Paratext));
                    _syncMetrics.TextDocs.Updated++;
                }

                textDocs.Remove(kvp.Key);
            }
            else
            {
                textDataDoc = GetTextDoc(text, kvp.Key);
                async Task CreateText(Delta delta)
                {
                    await textDataDoc.FetchAsync();
                    if (textDataDoc.IsLoaded)
                        await textDataDoc.DeleteAsync();
                    await textDataDoc.CreateAsync(new TextData(delta));
                }
                tasks.Add(CreateText(kvp.Value.Delta));
                _syncMetrics.TextDocs.Added++;
            }
            chapters.Add(
                new Chapter
                {
                    Number = kvp.Key,
                    LastVerse = kvp.Value.LastVerse,
                    IsValid = kvp.Value.IsValid,
                    Permissions = [],
                }
            );
        }
        foreach (KeyValuePair<int, IDocument<TextData>> kvp in textDocs)
        {
            tasks.Add(kvp.Value.DeleteAsync());
            _syncMetrics.TextDocs.Deleted++;
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
        int? bookNum,
        Dictionary<string, IDocument<NoteThread>> noteThreadDocs,
        Dictionary<int, ChapterDelta> chapterDeltas
    )
    {
        IEnumerable<NoteThreadChange> noteThreadChanges = _paratextService.GetNoteThreadChanges(
            _userSecret,
            _projectDoc.Data.ParatextId,
            bookNum,
            noteThreadDocs.Values,
            chapterDeltas,
            _currentPtSyncUsers
        );
        var tasks = new List<Task>();

        foreach (NoteThreadChange change in noteThreadChanges)
        {
            // Find the thread doc if it exists
            if (
                change.ThreadDataId == null
                || !noteThreadDocs.TryGetValue(change.ThreadDataId, out IDocument<NoteThread> threadDoc)
            )
            {
                // Create a new ParatextNoteThread doc
                string newThreadDataId = _guidService.NewObjectId();
                IDocument<NoteThread> doc = GetNoteThreadDoc(newThreadDataId);
                async Task CreateThreadDoc(NoteThreadChange change)
                {
                    VerseRef verseRef = new VerseRef();
                    verseRef.Parse(change.VerseRefStr);
                    VerseRefData vrd = new VerseRefData(verseRef.BookNum, verseRef.ChapterNum, verseRef.Verse);
                    await doc.CreateAsync(
                        new NoteThread
                        {
                            DataId = newThreadDataId,
                            ThreadId = change.ThreadId,
                            ProjectRef = _projectDoc.Id,
                            VerseRef = vrd,
                            OriginalSelectedText = change.SelectedText,
                            OriginalContextBefore = change.ContextBefore,
                            OriginalContextAfter = change.ContextAfter,
                            Position = change.Position,
                            Status = change.Status,
                            Assignment = change.Assignment,
                            BiblicalTermId = change.BiblicalTermId,
                            ExtraHeadingInfo = change.ExtraHeadingInfo,
                        }
                    );
                    await SubmitChangesOnNoteThreadDocAsync(doc, change);
                }
                tasks.Add(CreateThreadDoc(change));
                _syncMetrics.NoteThreads.Added++;
            }
            else
            {
                tasks.Add(SubmitChangesOnNoteThreadDocAsync(threadDoc, change));
                if (change.ThreadUpdated)
                {
                    _syncMetrics.NoteThreads.Updated++;
                }
            }
        }
        await Task.WhenAll(tasks);
    }

    /// <summary>
    /// Gets the text docs from <paramref name="docs"/> for the book specified in <paramref name="text"/>.
    /// </summary>
    private SortedList<int, IDocument<TextData>> GetTextDocsForBook(
        TextInfo text,
        IReadOnlyCollection<IDocument<TextData>> docs
    )
    {
        var textDocs = new SortedList<int, IDocument<TextData>>(text.Chapters.Count);
        foreach (Chapter chapter in text.Chapters)
        {
            IDocument<TextData>? textDoc = docs.FirstOrDefault(d =>
                d.Id == TextData.GetTextDocId(_projectDoc.Id, text.BookNum, chapter.Number)
            );
            if (textDoc is not null)
            {
                textDocs[chapter.Number] = textDoc;
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

    /// <summary>
    /// Fetches all of the Biblical Terms for the current project.
    /// </summary>
    /// <returns>The Biblical Terms collection.</returns>
    private async Task<IReadOnlyCollection<IDocument<BiblicalTerm>>> FetchBiblicalTermDocsAsync()
    {
        List<string> ids = await _realtimeService
            .QuerySnapshots<BiblicalTerm>()
            .Where(bt => bt.ProjectRef == _projectDoc.Id)
            .Select(bt => bt.Id)
            .ToListAsync();
        return await _conn.GetAndFetchDocsAsync<BiblicalTerm>(ids.ToArray());
    }

    /// <summary>
    /// Apply the changes to a ParatextNoteThread doc.
    /// TODO: Handle if verseRef changes
    /// </summary>
    private async Task SubmitChangesOnNoteThreadDocAsync(IDocument<NoteThread> threadDoc, NoteThreadChange change)
    {
        bool hasNotesInThread =
            change.NotesAdded.Count > 0 || threadDoc.Data.Notes.Any(n => !change.NoteIdsRemoved.Contains(n.DataId));
        if (!hasNotesInThread)
        {
            await threadDoc.DeleteAsync();
            _syncMetrics.NoteThreads.Deleted++;
            return;
        }

        await threadDoc.SubmitJson0OpAsync(op =>
        {
            // Update thread details
            if (change.ThreadUpdated)
            {
                if (threadDoc.Data.Status != change.Status)
                    op.Set(td => td.Status, change.Status);
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
                    {
                        op.Set(td => td.Notes[index].Content, updated.Content);

                        // As the note content has been updated by PT, disable editing
                        if (threadDoc.Data.Notes[index].Editable == true)
                        {
                            op.Set(td => td.Notes[index].Editable, false);
                        }
                    }

                    if (threadDoc.Data.Notes[index].Status != updated.Status)
                        op.Set(td => td.Notes[index].Status, updated.Status);
                    if (threadDoc.Data.Notes[index].Type != updated.Type)
                        op.Set(td => td.Notes[index].Type, updated.Type);
                    if (threadDoc.Data.Notes[index].ConflictType != updated.ConflictType)
                        op.Set(td => td.Notes[index].ConflictType, updated.ConflictType);
                    if (threadDoc.Data.Notes[index].TagId != updated.TagId)
                        op.Set(td => td.Notes[index].TagId, updated.TagId);
                    if (threadDoc.Data.Notes[index].Assignment != updated.Assignment)
                        op.Set(td => td.Notes[index].Assignment, updated.Assignment);
                    if (threadDoc.Data.Notes[index].AcceptedChangeXml != updated.AcceptedChangeXml)
                        op.Set(td => td.Notes[index].AcceptedChangeXml, updated.AcceptedChangeXml);
                    if (threadDoc.Data.Notes[index].VersionNumber != updated.VersionNumber)
                        op.Set(td => td.Notes[index].VersionNumber, updated.VersionNumber);
                    _syncMetrics.Notes.Updated++;
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
                    _syncMetrics.Notes.Deleted++;
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
                ParatextUserProfile paratextUser = null;
                string username = string.IsNullOrEmpty(added.SyncUserRef)
                    ? null
                    : _currentPtSyncUsers.Values.Single(u => u.OpaqueUserId == added.SyncUserRef).Username;
                if (username != null)
                    _currentPtSyncUsers.TryGetValue(username, out paratextUser);

                added.OwnerRef = string.IsNullOrEmpty(paratextUser?.SFUserId) ? _userSecret.Id : paratextUser?.SFUserId;
                op.Add(td => td.Notes, added);
                _syncMetrics.Notes.Added++;
            }

            List<int> removedIndices =
            [
                .. change
                    .NoteIdsRemoved.Select(id => threadDoc.Data.Notes.FindIndex(n => n.DataId == id))
                    .Where(index => index >= 0),
            ];
            // Go through the indices in reverse order so subsequent removal indices are not affected
            removedIndices.Sort((a, b) => b.CompareTo(a));
            foreach (int index in removedIndices)
            {
                // Permanently removes a note
                op.Remove(td => td.Notes, index);
                _syncMetrics.Notes.Removed++;
            }

            if (change.Position != null)
                op.Set(td => td.Position, change.Position);
        });
    }

    private async Task UpdateTranslateNoteTag(string targetParatextId)
    {
        int? defaultTagId = _projectDoc.Data.TranslateConfig.DefaultNoteTagId;
        if (defaultTagId == null)
        {
            var newNoteTag = new NoteTag
            {
                TagId = NoteTag.notSetId,
                Icon = NoteTag.sfNoteTagIcon,
                Name = NoteTag.sfNoteTagName,
            };
            // Note: If we introduce a new note tag and the remote PT repo also introduces a note tag,
            // the tag introduced here will get overwritten
            int noteTagId = _paratextService.UpdateCommentTag(_userSecret, targetParatextId, newNoteTag);
            await _projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.TranslateConfig.DefaultNoteTagId, noteTagId));
        }
    }

    private async Task UpdateCheckingNoteTag(string targetParatextId)
    {
        int noteTagId = _projectDoc.Data.CheckingConfig.NoteTagId ?? NoteTag.notSetId;
        if (noteTagId != NoteTag.notSetId)
            return;
        var newNoteTag = new NoteTag
        {
            TagId = NoteTag.notSetId,
            Icon = NoteTag.checkingTagIcon,
            Name = NoteTag.checkingTagName,
        };
        noteTagId = _paratextService.UpdateCommentTag(_userSecret, targetParatextId, newNoteTag);
        await _projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.CheckingConfig.NoteTagId, noteTagId));
    }

    /// <summary>
    /// Preserve all whitespace in data but remove whitespace at the beginning of lines and remove line endings.
    /// </summary>
    private static XElement ParseText(string text)
    {
        text = text.Trim().Replace("\r\n", "\n");
        text = WhitespaceBeforeTagsRegex.Replace(text, "<");
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
            .Where(n => n.ProjectRef == _projectDoc.Id && n.VerseRef.BookNum == bookNum && n.BiblicalTermId == null);
        IEnumerable<string> noteThreadDocIds = threadDocs
            .Where(nt => chaptersToDelete.Contains(nt.VerseRef.ChapterNum))
            .Select(n => n.Id);
        // Make a record of the note thread doc ids to return since they are removed
        // from noteThreadDocIds after the docs are deleted.
        List<string> deletedNoteThreadDocIds = [.. noteThreadDocIds];

        var tasks = new List<Task>();
        foreach (string noteThreadDocId in deletedNoteThreadDocIds)
        {
            async Task DeleteNoteThread()
            {
                // Delete notes that are not Biblical Terms notes
                IDocument<NoteThread> noteThreadDoc = await _conn.FetchAsync<NoteThread>(noteThreadDocId);
                if (noteThreadDoc.IsLoaded)
                    await noteThreadDoc.DeleteAsync();
            }
            tasks.Add(DeleteNoteThread());
        }

        await Task.WhenAll(tasks);
        _syncMetrics.NoteThreads.Deleted += deletedNoteThreadDocIds.Count;
        return deletedNoteThreadDocIds;
    }

    private async Task CompleteSync(bool successful, bool canRollbackParatext, CancellationToken token)
    {
        await NotifySyncProgress(SyncPhase.Phase9, 60.0);
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
        if (!successful || _paratextService.IsResource(_projectDoc.Data.ParatextId) || token.IsCancellationRequested)
        {
            // Do not update permissions on sync, if this is a resource project, as then,
            // permission updates will be performed when a target project is synchronized.
            // If the token is cancelled, do not update permissions as GetProjectRolesAsync will fail.
            ptUserRoles = new Dictionary<string, string>();
            updateRoles = false;
        }
        else
        {
            ptUserRoles = _paratextUsers.ToDictionary(u => u.ParatextId, u => u.Role);
        }

        var userIdsToRemove = new List<string>();
        var projectUsers = await _realtimeService
            .QuerySnapshots<User>()
            .Where(u => _projectDoc.Data.UserRoles.Keys.Contains(u.Id) && u.ParatextId != null)
            .Select(u => new { UserId = u.Id, u.ParatextId })
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
                string repoVersion = _paratextService.GetLatestSharedVersion(_userSecret, _projectDoc.Data.ParatextId);
                dataInSync = repoVersion == _projectDoc.Data.Sync.SyncedToRepositoryVersion;
            }
        }

        await _projectDoc.SubmitJson0OpAsync(op =>
        {
            // Get the latest shared revision of the local hg repo. On a failed synchronize attempt, the data
            // is known to be out of sync if the revision does not match the corresponding revision stored
            // on the project doc.
            string repoVersion = _paratextService.GetLatestSharedVersion(_userSecret, _projectDoc.Data.ParatextId);

            if (successful)
            {
                Log($"CompleteSync: Successfully synchronized to PT repo commit id '{repoVersion}'.");
                op.Set(pd => pd.Sync.DateLastSuccessfulSync, DateTime.UtcNow);
                op.Set(pd => pd.Sync.SyncedToRepositoryVersion, repoVersion);
                // If the sync was successful, then the last sync error code should be cleared
                op.Unset(pd => pd.Sync.LastSyncErrorCode);
            }
            else
            {
                Log(
                    $"CompleteSync: Failed to synchronize. PT repo latest shared version is '{repoVersion}'. SF DB project SyncedToRepositoryVersion is '{_projectDoc.Data.Sync.SyncedToRepositoryVersion}'."
                );
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

            ParatextSettings? settings = _paratextService.GetParatextSettings(_userSecret, _projectDoc.Data.ParatextId);
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
                if (settings.NoteTags != null)
                    op.Set(pd => pd.NoteTags, settings.NoteTags, _noteTagListEqualityComparer);
                if (settings.LanguageRegion != null)
                    op.Set(pd => pd.WritingSystem.Region, settings.LanguageRegion);
                if (settings.LanguageScript != null)
                    op.Set(pd => pd.WritingSystem.Script, settings.LanguageScript);
                if (settings.LanguageTag != null)
                    op.Set(pd => pd.WritingSystem.Tag, settings.LanguageTag);
                op.Set(pd => pd.TranslateConfig.ProjectType, settings.ProjectType);
                if (!string.IsNullOrEmpty(settings.BaseProjectParatextId))
                {
                    // Set the base project
                    if (_projectDoc.Data.TranslateConfig.BaseProject is null)
                    {
                        // Create a new base project record
                        op.Set(
                            pd => pd.TranslateConfig.BaseProject,
                            new BaseProject
                            {
                                ParatextId = settings.BaseProjectParatextId,
                                ShortName = settings.BaseProjectShortName,
                            }
                        );
                    }
                    else
                    {
                        // Update the existing base project record
                        op.Set(pd => pd.TranslateConfig.BaseProject.ParatextId, settings.BaseProjectParatextId);
                        op.Set(pd => pd.TranslateConfig.BaseProject.ShortName, settings.BaseProjectShortName);
                    }
                }
                else if (_projectDoc.Data.TranslateConfig.BaseProject is not null)
                {
                    // There is no longer a base project, so remove the base project record
                    op.Unset(pd => pd.TranslateConfig.BaseProject);
                }

                // Update the copyright banner
                if (settings.CopyrightBanner is not null)
                {
                    op.Set(pd => pd.CopyrightBanner, settings.CopyrightBanner);
                }
                else if (_projectDoc.Data.CopyrightBanner is not null)
                {
                    // There is no longer a copyright banner, so remove it
                    op.Unset(pd => pd.CopyrightBanner);
                }

                // Update the copyright notice
                if (settings.CopyrightNotice is not null)
                {
                    op.Set(pd => pd.CopyrightNotice, settings.CopyrightNotice);
                }
                else if (_projectDoc.Data.CopyrightNotice is not null)
                {
                    // There is no longer a copyright notice, so remove it
                    op.Unset(pd => pd.CopyrightNotice);
                }
            }

            // The source can be null if there was an error getting a resource from the DBL
            if (_projectDoc.Data.TranslateConfig.Source != null)
            {
                ParatextSettings? sourceSettings = _paratextService.GetParatextSettings(
                    _userSecret,
                    _projectDoc.Data.TranslateConfig.Source.ParatextId
                );
                if (sourceSettings != null)
                {
                    op.Set(pd => pd.TranslateConfig.Source.IsRightToLeft, sourceSettings.IsRightToLeft);
                    if (sourceSettings.LanguageRegion != null)
                        op.Set(pd => pd.WritingSystem.Region, sourceSettings.LanguageRegion);
                    if (sourceSettings.LanguageScript != null)
                        op.Set(pd => pd.WritingSystem.Script, sourceSettings.LanguageScript);
                    if (sourceSettings.LanguageTag != null)
                        op.Set(pd => pd.TranslateConfig.Source.WritingSystem.Tag, sourceSettings.LanguageTag);
                }
            }
        });
        await NotifySyncProgress(SyncPhase.Phase9, 80.0);

        if (_syncMetrics != null)
        {
            _syncMetrics.Users.Deleted = userIdsToRemove.Count;
        }

        foreach (var userId in userIdsToRemove)
            await _projectService.RemoveUserWithoutPermissionsCheckAsync(_userSecret.Id, _projectDoc.Id, userId);

        // GetPTUsernameToSFUserIdsAsync will fail if the token is cancelled
        if (!token.IsCancellationRequested && _currentPtSyncUsers != null)
        {
            await _projectDoc.SubmitJson0OpAsync(op =>
            {
                List<string> userIdsAdded = [];
                foreach (ParatextUserProfile activePtSyncUser in _currentPtSyncUsers.Values)
                {
                    ParatextUserProfile existingUser = _projectDoc.Data.ParatextUsers.SingleOrDefault(u =>
                        u.Username == activePtSyncUser.Username
                    );
                    if (existingUser == null)
                    {
                        // Ensure the PT user gets the up-to-date SF user ID
                        activePtSyncUser.SFUserId = _paratextUsers
                            .SingleOrDefault(u => u.Username == activePtSyncUser.Username)
                            ?.Id;
                        op.Add(pd => pd.ParatextUsers, activePtSyncUser);
                        if (!string.IsNullOrEmpty(activePtSyncUser.SFUserId))
                            userIdsAdded.Add(activePtSyncUser.SFUserId);
                    }
                    else if (string.IsNullOrEmpty(existingUser.SFUserId))
                    {
                        int index = _projectDoc.Data.ParatextUsers.FindIndex(u =>
                            u.Username == activePtSyncUser.Username
                        );
                        string? userId = _paratextUsers
                            .SingleOrDefault(u => u.Username == activePtSyncUser.Username)
                            ?.Id;
                        if (!string.IsNullOrEmpty(userId))
                        {
                            op.Set(pd => pd.ParatextUsers[index].SFUserId, userId);
                            userIdsAdded.Add(userId);
                        }
                    }
                }
                foreach (string userId in userIdsAdded)
                {
                    int index = _projectDoc.Data.ParatextUsers.FindIndex(u => u.SFUserId == userId);
                    if (index > -1)
                    {
                        // Unset the old user that had the same ID
                        op.Unset(pd => pd.ParatextUsers[index].SFUserId);
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
                    Log("CompleteSync: Failure backing up local PT repo.");
                }
            }

            // Write the operations to the database
            await _conn.CommitTransactionAsync();
        }
        else
        {
            // Rollback the operations (the repository was restored above)
            _conn.RollbackTransaction();
        }

        // NOTE: This is executed outside the transaction because QueuedCount updates the frontend,
        // and dataInSync must record the real value if a transaction fails.
        await _projectDoc.SubmitJson0OpAsync(op =>
        {
            op.Set(pd => pd.Sync.DataInSync, dataInSync);
            op.Set(pd => pd.Sync.LastSyncSuccessful, successful);

            // The frontend checks the queued count to determine if the sync is complete. The ShareDB client emits
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
                    $"CompleteSync: Warning: SF project id {_projectDoc.Id} QueuedCount is unexpectedly "
                        + $"{_projectDoc.Data.Sync.QueuedCount}. Setting to 0 instead of decrementing."
                );
                op.Set(pd => pd.Sync.QueuedCount, 0);
            }
        });

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

        // Free the comment manager and versioning manager for this project from memory
        _paratextService.ClearParatextDataCaches(_userSecret, _projectDoc.Data.ParatextId);
        _paratextService.ClearForcedUsernames();

        await NotifySyncProgress(SyncPhase.Phase9, 100.0);
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

    private Dictionary<string, ParatextUserProfile> GetCurrentProjectPtUsers()
    {
        _paratextService.ClearForcedUsernames();
        Dictionary<string, ParatextUserProfile> availablePtUsers = _projectDoc.Data.ParatextUsers.ToDictionary(p =>
            p.Username
        );
        foreach (ParatextProjectUser paratextUser in _paratextUsers)
        {
            ParatextUserProfile userProfileToAdd = null;
            string sfUserId = paratextUser.Id;
            if (!availablePtUsers.TryGetValue(paratextUser.Username, out ParatextUserProfile profile))
            {
                userProfileToAdd = new ParatextUserProfile
                {
                    Username = paratextUser.Username,
                    SFUserId = sfUserId,
                    OpaqueUserId = _guidService.NewObjectId(),
                };
            }
            else
            {
                // If we do not have the SF user Id set, set the SF user Id to be stored when CompleteSync() is called.
                // We create a new object to so that the logic in projectDoc.SubmitJson0OpAsync() will see the change.
                if (profile.SFUserId is null)
                {
                    userProfileToAdd = new ParatextUserProfile
                    {
                        Username = profile.Username,
                        SFUserId = sfUserId,
                        OpaqueUserId = profile.OpaqueUserId,
                    };
                }
            }
            if (!string.IsNullOrEmpty(sfUserId) && userProfileToAdd is not null)
            {
                // Detect if the SF user ID is already attached to a Paratext user. Force the old PT username
                ParatextUserProfile oldPtUser = availablePtUsers.Values.SingleOrDefault(u => u.SFUserId == sfUserId);
                if (oldPtUser is not null)
                {
                    userProfileToAdd.SFUserId = null;
                    _paratextService.ForceParatextUsername(paratextUser.Username, oldPtUser.Username);
                }
            }
            if (userProfileToAdd is not null)
                availablePtUsers[paratextUser.Username] = userProfileToAdd;
        }
        return availablePtUsers;
    }

    /// <summary>
    /// Gets a text doc from the database.
    /// </summary>
    /// <param name="text">The text info.</param>
    /// <param name="chapter">The chapter number</param>
    /// <returns>The TextData IDocument</returns>
    /// <remarks>This is internal for use in unit tests.</remarks>
    internal IDocument<TextData> GetTextDoc(TextInfo text, int chapter) =>
        _conn.Get<TextData>(TextData.GetTextDocId(_projectDoc.Id, text.BookNum, chapter));

    private async Task DeleteTextDocAsync(TextInfo text, int chapter)
    {
        IDocument<TextData> textDoc = GetTextDoc(text, chapter);
        await textDoc.FetchAsync();
        if (textDoc.IsLoaded)
            await textDoc.DeleteAsync();
    }

    private IDocument<NoteThread> GetNoteThreadDoc(string dataId) =>
        _conn.Get<NoteThread>($"{_projectDoc.Id}:{dataId}");

    /// <summary>Get chapter texts from Paratext project repository, as deltas.</summary>
    internal Dictionary<int, ChapterDelta> GetParatextChaptersAsDeltas(TextInfo text, string paratextId)
    {
        XDocument usxDoc = GetBookUsx(paratextId, text.BookNum);
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
            await NotifySyncProgress(SyncPhase.Phase4, progress.ProgressValue);
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
                        1.0 / _numberOfPhases * (double)syncPhase
                        + (progress > 1.0 ? progress / 100.0 : progress) * 1.0 / _numberOfPhases,
                    SyncPhase = syncPhase,
                    SyncProgress = progress,
                }
            );
        }
    }

    private void Log(string message, string? projectSFId = null, string? userId = null)
    {
        projectSFId ??= _projectDoc?.Id ?? "unknown";
        userId ??= _userSecret?.Id ?? "unknown";
        _logger.LogInformation($"SyncLog ({projectSFId} {userId}): {message}");
        _syncMetrics.Log.Add($"{DateTime.UtcNow:u} {message}");
    }

    private void LogMetric(string message) => Log(message);
}
