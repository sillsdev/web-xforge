using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using SIL.Machine.WebApi.Services;
using SIL.ObjectModel;
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
    /// 1. The real-time docs stored in Mongo.
    /// 2. The local Paratext project repo.
    /// 3. The remote Paratext project repo.
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
    /// </summary>
    public class ParatextSyncRunner : IParatextSyncRunner
    {
        private static readonly IEqualityComparer<List<Chapter>> _chapterListEqualityComparer =
            SequenceEqualityComparer.Create(new ChapterEqualityComparer());

        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly ISFProjectService _projectService;
        private readonly IEngineService _engineService;
        private readonly IParatextService _paratextService;
        private readonly IRealtimeService _realtimeService;
        private readonly IDeltaUsxMapper _deltaUsxMapper;
        private readonly IParatextNotesMapper _notesMapper;
        private readonly ILogger<ParatextSyncRunner> _logger;

        private IConnection _conn;
        private UserSecret _userSecret;
        private IDocument<SFProject> _projectDoc;
        private SFProjectSecret _projectSecret;

        public ParatextSyncRunner(IRepository<UserSecret> userSecrets, IRepository<SFProjectSecret> projectSecrets,
            ISFProjectService projectService, IEngineService engineService, IParatextService paratextService,
            IRealtimeService realtimeService, IDeltaUsxMapper deltaUsxMapper, IParatextNotesMapper notesMapper,
            ILogger<ParatextSyncRunner> logger)
        {
            _userSecrets = userSecrets;
            _projectSecrets = projectSecrets;
            _projectService = projectService;
            _engineService = engineService;
            _paratextService = paratextService;
            _realtimeService = realtimeService;
            _logger = logger;
            _deltaUsxMapper = deltaUsxMapper;
            _notesMapper = notesMapper;
        }

        private bool TranslationSuggestionsEnabled => _projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled;
        private bool CheckingEnabled => _projectDoc.Data.CheckingConfig.CheckingEnabled;

        /// <summary>
        /// Synchronize content and user permissions in SF DB with Paratext SendReceive servers and PT Registry, for
        /// a project.
        /// </summary>
        /// <remarks>
        /// Do not allow multiple sync jobs to run in parallel on the same project by creating a hangfire mutex on the
        /// <param name="projectId"/> parameter, i.e. "{0}".
        /// </remarks>
        [Mutex("{0}")]
        public async Task RunAsync(string projectId, string userId, bool trainEngine, CancellationToken token)
        {
            // Whether or not we can rollback Paratext
            bool canRollbackParatext = false;
            try
            {
                if (!await InitAsync(projectId, userId, token))
                {
                    await CompleteSync(false, canRollbackParatext, token);
                    return;
                }

                string targetParatextId = _projectDoc.Data.ParatextId;
                string sourceParatextId = _projectDoc.Data.TranslateConfig.Source?.ParatextId;
                string sourceProjectRef = _projectDoc.Data.TranslateConfig.Source?.ProjectRef;
                Log($"RunAsync: Starting. Target PTID '{targetParatextId}', source PTID '{sourceParatextId}'.");

                // Determine if we can rollback Paratext
                canRollbackParatext = _paratextService.BackupExists(_userSecret, targetParatextId);
                if (!canRollbackParatext)
                {
                    // Attempt to create a backup if we cannot rollback
                    canRollbackParatext = _paratextService.BackupRepository(_userSecret, targetParatextId);
                    if (canRollbackParatext)
                    {
                        Log($"RunAsync: There wasn't already a local PT repo backup, so we made one.");
                    }
                    else
                    {
                        Log($"RunAsync: There wasn't already a local PT repo backup, so we tried to make one but failed.");
                    }
                }

                var targetTextDocsByBook = new Dictionary<int, SortedList<int, IDocument<TextData>>>();
                var questionDocsByBook = new Dictionary<int, IReadOnlyList<IDocument<Question>>>();
                string lastSharedVersion = _paratextService.GetLatestSharedVersion(_userSecret, targetParatextId);

                bool isDataInSync = false;
                if (lastSharedVersion == null)
                {
                    // The hg repository has no pushed or pulled commit. Maybe we are only just getting set up with a
                    // project. Maybe it is a resource and not a project and has no hg repo directory.
                    isDataInSync = true;
                    Log($"RunAsync: The local PT repo has no last shared revision. Considering that data is in sync.");
                }
                if (lastSharedVersion == _projectDoc.Data.Sync.SyncedToRepositoryVersion)
                {
                    // The recent hg repository pushed or pulled commit id matches what we recorded as being the last
                    // place where SF and PT last synced.
                    isDataInSync = true;
                    Log($"RunAsync: The local PT repo last shared rev matches the SF DB SyncedToRepositoryVersion of '{lastSharedVersion}'. Is in sync.");
                }
                if (_projectDoc.Data.Sync.SyncedToRepositoryVersion == null && _projectDoc.Data.Sync.DataInSync == null)
                {
                    // We have no record of where SF and PT last synced. So it was probably before we started tracking
                    // this. Or this is a resource that we won't have this information for. Assume the data is
                    // 'in sync'.
                    // Note that there is a special case where SyncedToRepositoryVersion may be absent, but DataInSync
                    // may be present (and false), which may indicate a situation where a project only had unsuccessful
                    // syncs since we started tracking SyncedToRepositoryVersion. Note that this could happen if the
                    // _first_ sync, from Connecting, had a failure. In this case, isDataInSync should
                    // be false.
                    // There is also a special case where SyncedToRepositoryVersion may be absent, but DataInSync may
                    // be present (and true), which may indicate that the initial Connect project failed to hg clone.
                    isDataInSync = true;
                    Log($"RunAsync: The SF DB project has no settings for Sync.SyncedToRepositoryVersion or Sync.DataInSync. Considering that data is in sync.");
                }
                if (!isDataInSync)
                {
                    Log($"RunAsync: Considering that data is not in sync. The local PT repo last shared revision is '{lastSharedVersion}'. The SF DB project Sync.SyncedToRepositoryVersion is '{_projectDoc.Data.Sync.SyncedToRepositoryVersion}'. canRollbackParatext is '{canRollbackParatext}'.");
                }

                // update target Paratext books and notes
                foreach (TextInfo text in _projectDoc.Data.Texts)
                {
                    SortedList<int, IDocument<TextData>> targetTextDocs = await FetchTextDocsAsync(text);
                    targetTextDocsByBook[text.BookNum] = targetTextDocs;
                    if (isDataInSync)
                        await UpdateParatextBook(text, targetParatextId, targetTextDocs);

                    IReadOnlyList<IDocument<Question>> questionDocs = await FetchQuestionDocsAsync(text);
                    questionDocsByBook[text.BookNum] = questionDocs;
                    if (isDataInSync)
                        await UpdateParatextNotesAsync(text, questionDocs);
                }

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, token);
                    return;
                }

                // Use the new progress bar
                var progress = new SyncProgress();
                try
                {
                    // Create the handler
                    progress.ProgressUpdated += SyncProgress_ProgressUpdated;

                    Log($"RunAsync: Going to do ParatextData SendReceive.");
                    // perform Paratext send/receive
                    await _paratextService.SendReceiveAsync(_userSecret, targetParatextId, progress, token);
                    Log($"RunAsync: ParatextData SendReceive finished without throwing.");
                }
                finally
                {
                    // Deregister the handler
                    progress.ProgressUpdated -= SyncProgress_ProgressUpdated;
                }

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, token);
                    return;
                }

                var targetBooks = new HashSet<int>(_paratextService.GetBookList(_userSecret, targetParatextId));
                var sourceBooks = new HashSet<int>(TranslationSuggestionsEnabled
                    ? _paratextService.GetBookList(_userSecret, sourceParatextId)
                    : Enumerable.Empty<int>());
                sourceBooks.IntersectWith(targetBooks);

                var targetBooksToDelete = new HashSet<int>(_projectDoc.Data.Texts.Select(t => t.BookNum)
                    .Except(targetBooks));

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, token);
                    return;
                }

                // delete all data for removed books
                if (targetBooksToDelete.Count > 0)
                {
                    Log($"RunAsync: Going to delete texts and questions,comments,answers for {targetBooksToDelete.Count} books.");
                    // delete target books
                    foreach (int bookNum in targetBooksToDelete)
                    {
                        int textIndex = _projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                        TextInfo text = _projectDoc.Data.Texts[textIndex];
                        await _projectDoc.SubmitJson0OpAsync(op => op.Remove(pd => pd.Texts, textIndex));

                        await DeleteAllTextDocsForBookAsync(text);
                        await DeleteAllQuestionsDocsForBookAsync(text);
                    }
                }

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, token);
                    return;
                }

                // Update user resource access, if this project has a source resource
                // The updating of a source project's permissions is done when that project is synced.
                if (TranslationSuggestionsEnabled
                    && !string.IsNullOrWhiteSpace(sourceParatextId)
                    && !string.IsNullOrWhiteSpace(sourceProjectRef)
                    && _paratextService.IsResource(sourceParatextId))
                {
                    // Get the resource project
                    IDocument<SFProject> sourceProject = await _conn.FetchAsync<SFProject>(sourceProjectRef);
                    if (sourceProject.IsLoaded)
                    {
                        // NOTE: The following additions/removals not included in the transaction

                        // Add new users who are in the target project, but not the source project
                        List<string> usersToAdd =
                            _projectDoc.Data.UserRoles.Keys.Except(sourceProject.Data.UserRoles.Keys).ToList();
                        foreach (string uid in usersToAdd)
                        {
                            // As resource projects do not have administrators, we connect as the user we are to add
                            try
                            {
                                await _projectService.AddUserAsync(uid, sourceProjectRef);
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
                            string permission =
                                await _paratextService.GetResourcePermissionAsync(sourceParatextId, uid, token);
                            if (permission == TextInfoPermission.None)
                            {
                                // As resource projects don't have administrators, connect as the user we are to remove
                                await _projectService.RemoveUserAsync(uid, sourceProjectRef, uid);
                            }
                        }
                    }
                }

                await UpdateDocsAsync(targetParatextId, targetTextDocsByBook, questionDocsByBook, targetBooks, sourceBooks);
                await _projectService.UpdatePermissionsAsync(userId, _projectDoc, token);

                // Check for cancellation
                if (token.IsCancellationRequested)
                {
                    await CompleteSync(false, canRollbackParatext, token);
                    return;
                }

                if (TranslationSuggestionsEnabled && trainEngine)
                {
                    // start training Machine engine
                    await _engineService.StartBuildByProjectIdAsync(projectId);
                }

                await CompleteSync(true, canRollbackParatext, token);
            }
            catch (Exception e)
            {
                if (!(e is TaskCanceledException))
                {
                    _logger.LogError(e, "Error occurred while executing Paratext sync for project '{Project}'", projectId);
                }

                await CompleteSync(false, canRollbackParatext, token);
            }
            finally
            {
                CloseConnection();
            }
        }

        private async Task UpdateDocsAsync(string targetParatextId,
            Dictionary<int, SortedList<int, IDocument<TextData>>> targetTextDocsByBook,
            Dictionary<int, IReadOnlyList<IDocument<Question>>> questionDocsByBook, HashSet<int> targetBooks,
            HashSet<int> sourceBooks)
        {
            // update source and target real-time docs
            foreach (int bookNum in targetBooks)
            {
                bool hasSource = sourceBooks.Contains(bookNum);
                int textIndex = _projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                TextInfo text;
                if (textIndex == -1)
                    text = new TextInfo { BookNum = bookNum, HasSource = hasSource };
                else
                    text = _projectDoc.Data.Texts[textIndex];

                // update target text docs
                if (!targetTextDocsByBook.TryGetValue(text.BookNum,
                    out SortedList<int, IDocument<TextData>> targetTextDocs))
                {
                    targetTextDocs = new SortedList<int, IDocument<TextData>>();
                }

                List<Chapter> newSetOfChapters = await UpdateTextDocsAsync(text, targetParatextId, targetTextDocs);

                // update question docs
                if (questionDocsByBook.TryGetValue(text.BookNum,
                    out IReadOnlyList<IDocument<Question>> questionDocs))
                {
                    await UpdateQuestionDocsAsync(questionDocs, newSetOfChapters);
                }

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

        internal async Task<bool> InitAsync(string projectSFId, string userId, CancellationToken token)
        {
            _conn = await _realtimeService.ConnectAsync();
            _conn.BeginTransaction();
            _conn.ExcludePropertyFromTransaction<SFProject>(op => op.Sync.PercentCompleted);
            _conn.ExcludePropertyFromTransaction<SFProject>(op => op.Sync.QueuedCount);
            _conn.ExcludePropertyFromTransaction<SFProject>(op => op.Sync.DataInSync);
            _projectDoc = await _conn.FetchAsync<SFProject>(projectSFId);
            if (!_projectDoc.IsLoaded)
            {
                Log($"Project doc was not loaded.", projectSFId, userId);
                return false;
            }

            if (!(await _projectSecrets.TryGetAsync(projectSFId)).TryResult(out _projectSecret))
            {
                Log($"Could not find project secret.", projectSFId, userId);
                return false;
            }

            if (!(await _userSecrets.TryGetAsync(userId)).TryResult(out _userSecret))
            {
                Log($"Could not find user secret.", projectSFId, userId);
                return false;
            }

            List<User> paratextUsers = await _realtimeService.QuerySnapshots<User>()
                .Where(u => _projectDoc.Data.UserRoles.Keys.Contains(u.Id) && u.ParatextId != null)
                .ToListAsync();
            await _notesMapper.InitAsync(_userSecret, _projectSecret, paratextUsers, _projectDoc.Data, token);

            await _projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.Sync.PercentCompleted, 0));
            return true;
        }

        internal void CloseConnection()
        {
            _conn?.Dispose();
        }

        private async Task UpdateParatextBook(TextInfo text, string paratextId, SortedList<int, IDocument<TextData>> textDocs)
        {
            string bookText = _paratextService.GetBookText(_userSecret, paratextId, text.BookNum);
            var oldUsxDoc = XDocument.Parse(bookText);
            XDocument newUsxDoc = _deltaUsxMapper.ToUsx(oldUsxDoc, text.Chapters.OrderBy(c => c.Number)
                .Select(c => new ChapterDelta(c.Number, c.LastVerse, c.IsValid, textDocs[c.Number].Data)));

            if (!XNode.DeepEquals(oldUsxDoc, newUsxDoc))
            {
                string usx = newUsxDoc.Root.ToString();
                var chapterAuthors = await GetChapterAuthorsAsync(text, textDocs);
                await _paratextService.PutBookText(_userSecret, paratextId, text.BookNum, usx, chapterAuthors);
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
        internal async Task<Dictionary<int, string>> GetChapterAuthorsAsync(TextInfo text,
            SortedList<int, IDocument<TextData>> textDocs)
        {
            // Get all of the last editors for the chapters.
            var chapterAuthors = new Dictionary<int, string>();
            foreach (Chapter chapter in text.Chapters)
            {
                // This will be from 1 to number of chapters in the book
                int chapterNum = chapter.Number;

                // Attempt to find the last user who modified this chapter
                string userId = null;
                if (textDocs.TryGetValue(chapterNum, out IDocument<TextData> textDoc))
                {
                    // The Id is the value from TextData.GetTextDocId()
                    string textId = textDoc.Id;
                    int version = textDoc.Version;
                    userId = await _realtimeService.GetLastModifiedUserIdAsync<TextData>(textId, version);

                    // Check that this user still has write permissions
                    if (string.IsNullOrEmpty(userId)
                        || !chapter.Permissions.TryGetValue(userId, out string permission)
                        || permission != TextInfoPermission.Write)
                    {
                        // They no longer have write access, so reset the user id, and find it below
                        userId = null;
                    }
                }

                // If we do not have a record of the last user to modify this chapter
                if (string.IsNullOrEmpty(userId))
                {
                    // See if the current user has permissions
                    if (chapter.Permissions.TryGetValue(_userSecret.Id, out string permission)
                        && permission == TextInfoPermission.Write)
                    {
                        userId = _userSecret.Id;
                    }
                    else
                    {
                        // Get the first user with write permission
                        // NOTE: As a KeyValuePair is a struct, we do not need a null-conditional (key will be null)
                        userId = chapter.Permissions.FirstOrDefault(p => p.Value == TextInfoPermission.Write).Key;

                        // If the userId is still null, find a project administrator, as they can escalate privilege
                        if (string.IsNullOrEmpty(userId))
                        {
                            userId = _projectDoc.Data.UserRoles
                                .FirstOrDefault(p => p.Value == SFProjectRole.Administrator).Key;
                        }
                    }
                }

                // Set the author for the chapter
                chapterAuthors.Add(chapterNum, userId);
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

            XElement notesElem = await _notesMapper.GetNotesChangelistAsync(oldNotesElem, questionDocs);

            if (notesElem.Elements("thread").Any())
                _paratextService.PutNotes(_userSecret, _projectDoc.Data.ParatextId, notesElem.ToString());
        }

        private async Task<List<Chapter>> UpdateTextDocsAsync(TextInfo text, string paratextId,
            SortedList<int, IDocument<TextData>> textDocs, ISet<int> chaptersToInclude = null)
        {
            string bookText = _paratextService.GetBookText(_userSecret, paratextId, text.BookNum);
            var usxDoc = XDocument.Parse(bookText);
            var tasks = new List<Task>();
            Dictionary<int, ChapterDelta> deltas = _deltaUsxMapper.ToChapterDeltas(usxDoc)
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
                            tasks.Add(textDataDoc.SubmitOpAsync(diffDelta));
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
                }
                else
                {
                    addChapter = false;
                }
                if (addChapter)
                {
                    chapters.Add(new Chapter
                    {
                        Number = kvp.Key,
                        LastVerse = kvp.Value.LastVerse,
                        IsValid = kvp.Value.IsValid,
                        Permissions = { }
                    });
                }
            }
            foreach (KeyValuePair<int, IDocument<TextData>> kvp in textDocs)
            {
                if (chaptersToInclude == null
                    || chaptersToInclude.Contains(kvp.Key)
                    || chaptersToRemove.Contains(kvp.Key))
                {
                    tasks.Add(kvp.Value.DeleteAsync());
                }
            }

            await Task.WhenAll(tasks);
            return chapters;
        }

        private async Task UpdateQuestionDocsAsync(IReadOnlyList<IDocument<Question>> questionDocs,
            List<Chapter> newChapters)
        {
            // handle deletion of chapters
            var chapterNums = new HashSet<int>(newChapters.Select(c => c.Number));
            var tasks = new List<Task>();
            foreach (IDocument<Question> questionDoc in questionDocs)
            {
                if (!chapterNums.Contains(questionDoc.Data.VerseRef.ChapterNum))
                    tasks.Add(questionDoc.DeleteAsync());
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
        }

        private async Task<IReadOnlyList<IDocument<Question>>> FetchQuestionDocsAsync(TextInfo text)
        {
            List<string> questionDocIds = await _realtimeService.QuerySnapshots<Question>()
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
            List<string> questionDocIds = await _realtimeService.QuerySnapshots<Question>()
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
        }

        private async Task CompleteSync(bool successful, bool canRollbackParatext, CancellationToken token)
        {
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

            bool updateRoles = true;
            IReadOnlyDictionary<string, string> ptUserRoles;
            if (_paratextService.IsResource(_projectDoc.Data.ParatextId))
            {
                // Do not update permissions on sync, if this is a resource project
                // Permission updates will be performed when a target project is synchronized
                ptUserRoles = new Dictionary<string, string>();
                updateRoles = false;
            }
            else
            {
                try
                {
                    ptUserRoles = await _paratextService.GetProjectRolesAsync(_userSecret,
                        _projectDoc.Data, token);
                }
                catch (Exception ex)
                {
                    if (ex is HttpRequestException || ex is OperationCanceledException)
                    {
                        Log($"CompleteSync: Problem fetching project roles. Maybe the user does not have access to the project or cancelled the sync. ({ex})");
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
            var projectUsers = await _realtimeService.QuerySnapshots<User>()
                    .Where(u => _projectDoc.Data.UserRoles.Keys.Contains(u.Id) && u.ParatextId != null)
                    .Select(u => new { UserId = u.Id, ParatextId = u.ParatextId })
                    .ToListAsync();

            // If we have failed, restore the repository, if we can
            if (!successful && canRollbackParatext)
            {
                bool rollbackOutcome = _paratextService.RestoreRepository(_userSecret, _projectDoc.Data.ParatextId);
                Log($"CompleteSync: Sync was not successful. {(rollbackOutcome ? "Rolled back" : "Failed to roll back")} local PT repo.");
            }

            // NOTE: This is executed outside of the transaction because it modifies "Sync.PercentCompleted"
            await _projectDoc.SubmitJson0OpAsync(op =>
            {
                op.Unset(pd => pd.Sync.PercentCompleted);
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
                    Log($"CompleteSync: Failed to synchronize. PT repo latest shared version is '{repoVersion}'. SF DB project SyncedToRepositoryVersion is '{_projectDoc.Data.Sync.SyncedToRepositoryVersion}'.");
                    op.Set(pd => pd.Sync.DataInSync, repoVersion == _projectDoc.Data.Sync.SyncedToRepositoryVersion);
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

                // See if the full name of the project needs updating
                string fullName = _paratextService.GetProjectFullName(_userSecret, _projectDoc.Data.ParatextId);
                if (!string.IsNullOrEmpty(fullName))
                {
                    op.Set(pd => pd.Name, fullName);
                }

                // Set the right-to-left language flag
                bool isRtl = _paratextService.IsProjectLanguageRightToLeft(_userSecret, _projectDoc.Data.ParatextId);
                op.Set(pd => pd.IsRightToLeft, isRtl);

                // The source can be null if there was an error getting a resource from the DBL
                if (TranslationSuggestionsEnabled
                    && _projectDoc.Data.TranslateConfig.Source != null)
                {
                    bool sourceIsRtl = _paratextService
                        .IsProjectLanguageRightToLeft(_userSecret, _projectDoc.Data.TranslateConfig.Source.ParatextId);
                    op.Set(pd => pd.TranslateConfig.Source.IsRightToLeft, sourceIsRtl);
                }
            });
            foreach (var userId in userIdsToRemove)
                await _projectService.RemoveUserAsync(_userSecret.Id, _projectDoc.Id, userId);
            if (_notesMapper.NewSyncUsers.Count > 0)
            {
                await _projectSecrets.UpdateAsync(_projectSecret.Id, u =>
                {
                    foreach (SyncUser syncUser in _notesMapper.NewSyncUsers)
                        u.Add(p => p.SyncUsers, syncUser);

                    // If we have an id in the job ids collection, remove the first one
                    if (_projectSecret.JobIds.Any())
                    {
                        u.Remove(p => p.JobIds, _projectSecret.JobIds.First());
                    }
                });
            }
            else
            {
                // If we have an id in the job ids collection, remove the first one
                if (_projectSecret.JobIds.Any())
                {
                    await _projectSecrets.UpdateAsync(_projectSecret.Id, u =>
                    {
                        u.Remove(p => p.JobIds, _projectSecret.JobIds.First());
                    });
                }
            }

            // Commit or rollback the transaction, depending on success
            if (successful)
            {
                // Write the operations to the database
                await _conn.CommitTransactionAsync();

                // Backup the repository
                if (_projectDoc.Data.ParatextId.Length != SFInstallableDblResource.ResourceIdentifierLength)
                {
                    bool backupOutcome = _paratextService.BackupRepository(_userSecret, _projectDoc.Data.ParatextId);
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
            Log($"CompleteSync: Finished. Sync was {(successful ? "successful" : "unsuccessful")}.");
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

        private async void SyncProgress_ProgressUpdated(object sender, EventArgs e)
        {
            if (_projectDoc == null)
            {
                return;
            }
            else if (sender is SyncProgress progress)
            {
                double percentCompleted = progress.ProgressValue;
                if (percentCompleted >= 0)
                {
                    await _projectDoc.SubmitJson0OpAsync(op => op.Set(pd => pd.Sync.PercentCompleted, percentCompleted));
                }
            }
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

        private void Log(string message, string projectSFId = null, string userId = null)
        {
            projectSFId = projectSFId ?? _projectDoc?.Id ?? "unknown";
            userId = userId ?? _userSecret?.Id ?? "unknown";
            _logger.LogInformation($"SyncLog ({projectSFId},{userId}): {message}");
        }
    }
}
