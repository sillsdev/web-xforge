using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
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
using SIL.XForge.Scripture.Services;

namespace PTDDCloneAll
{
    /// <summary>
    /// COPIED AND MODIFIED FROM ParatextSyncRunner.cs
    ///
    /// This class syncs real-time text and question docs with the Paratext S/R server. This class coordinates the data
    /// flow between three sources:
    /// 1. The real-time docs stored in Mongo.
    /// 2. The local Paratext project repo.
    /// 3. The remote Paratext project repo.
    ///
    /// Algorithm:
    /// (omitted) 1. The text deltas from the real-time docs are converted to USX.
    /// (omitted) 2. The local repo is updated using the converted USX.
    /// (omitted) 3. A note changelist is computed by diffing the the real-time question docs and the notes in the local repo.
    /// (omitted) 4. The local repo is updated using the note changelist.
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
    public class PTDDSyncRunner
    {
        private static readonly IEqualityComparer<List<Chapter>> ChapterListEqualityComparer =
            SequenceEqualityComparer.Create(new ChapterEqualityComparer());

        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly ISFProjectService _projectService;
        private readonly IEngineService _engineService;
        private readonly IParatextService _paratextService;
        private readonly IRealtimeService _realtimeService;
        private readonly IDeltaUsxMapper _deltaUsxMapper;
        private readonly IParatextNotesMapper _notesMapper;
        private readonly ILogger<PTDDSyncRunner> _logger;

        private IConnection _conn;
        private UserSecret _userSecret;
        private IDocument<SFProject> _projectDoc;
        private SFProjectSecret _projectSecret;

        public PTDDSyncRunner(IRepository<UserSecret> userSecrets, IRepository<SFProjectSecret> projectSecrets,
            ISFProjectService projectService, IEngineService engineService, IParatextService paratextService,
            IRealtimeService realtimeService, IDeltaUsxMapper deltaUsxMapper, IParatextNotesMapper notesMapper,
            ILogger<PTDDSyncRunner> logger)
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

        // Do not allow multiple sync jobs to run in parallel on the same project by creating a mutex on the projectId
        // parameter, i.e. "{0}"
        [Mutex("{0}")]
        public async Task RunAsync(string projectId, string userId, bool trainEngine, bool silent)
        {
            try
            {
                if (!await InitAsync(projectId, userId))
                {
                    if (silent)
                    {
                        await _projectDoc.SubmitJson0OpAsync(op =>
                        {
                            op.Inc(pd => pd.Sync.QueuedCount, -1);
                            op.Unset(pd => pd.Sync.PercentCompleted);
                        });
                    }
                    else
                    {
                        await CompleteSync(false);
                    }
                    CloseConnection();
                    return;
                }

                string targetParatextId = _projectDoc.Data.ParatextId;
                string sourceParatextId = _projectDoc.Data.TranslateConfig.Source?.ParatextId;

                var targetTextDocsByBook = new Dictionary<int, SortedList<int, IDocument<TextData>>>();
                var sourceTextDocsByBook = new Dictionary<int, SortedList<int, IDocument<TextData>>>();
                var questionDocsByBook = new Dictionary<int, IReadOnlyList<IDocument<Question>>>();

                // update target Paratext books and notes
                foreach (TextInfo text in _projectDoc.Data.Texts)
                {
                    SortedList<int, IDocument<TextData>> targetTextDocs = await FetchTextDocsAsync(text,
                        TextType.Target);
                    targetTextDocsByBook[text.BookNum] = targetTextDocs;
                    // UpdateParatextBook(text, targetParatextId, targetTextDocs);
                    if (text.HasSource)
                        sourceTextDocsByBook[text.BookNum] = await FetchTextDocsAsync(text, TextType.Source);

                    IReadOnlyList<IDocument<Question>> questionDocs = await FetchQuestionDocsAsync(text);
                    questionDocsByBook[text.BookNum] = questionDocs;
                    // await UpdateParatextNotesAsync(text, questionDocs);
                }

                // perform Paratext send/receive
                await _paratextService.SendReceiveAsync(_userSecret, targetParatextId, sourceParatextId,
                    UseNewProgress());

                // This is a clone without persisting the changes to the SF DB
                if (silent)
                {
                    await _projectDoc.SubmitJson0OpAsync(op =>
                    {
                        op.Inc(pd => pd.Sync.QueuedCount, -1);
                        op.Unset(pd => pd.Sync.PercentCompleted);
                    });
                    CloseConnection();
                    return;
                }

                var targetBooks = new HashSet<int>(_paratextService.GetBookList(_userSecret, targetParatextId,
                    TextType.Target));
                var sourceBooks = new HashSet<int>(TranslationSuggestionsEnabled
                    ? _paratextService.GetBookList(_userSecret, targetParatextId, TextType.Source)
                    : Enumerable.Empty<int>());
                sourceBooks.IntersectWith(targetBooks);

                var targetBooksToDelete = new HashSet<int>(_projectDoc.Data.Texts.Select(t => t.BookNum)
                    .Except(targetBooks));
                var sourceBooksToDelete = new HashSet<int>(TranslationSuggestionsEnabled
                    ? _projectDoc.Data.Texts.Where(t => t.HasSource).Select(t => t.BookNum).Except(sourceBooks)
                    : Enumerable.Empty<int>());

                // delete all data for removed books
                if (targetBooksToDelete.Count > 0 || sourceBooksToDelete.Count > 0)
                {
                    // delete source books
                    foreach (int bookNum in sourceBooksToDelete)
                    {
                        TextInfo text = _projectDoc.Data.Texts.First(t => t.BookNum == bookNum);
                        await DeleteAllTextDocsForBookAsync(text, TextType.Source);
                    }
                    // delete target books
                    foreach (int bookNum in targetBooksToDelete)
                    {
                        int textIndex = _projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                        TextInfo text = _projectDoc.Data.Texts[textIndex];
                        await _projectDoc.SubmitJson0OpAsync(op => op.Remove(pd => pd.Texts, textIndex));

                        await DeleteAllTextDocsForBookAsync(text, TextType.Target);
                        await DeleteAllQuestionsDocsForBookAsync(text);
                    }
                }

                // update source and target real-time docs
                foreach (int bookNum in targetBooks)
                {
                    bool hasSource = sourceBooks.Contains(bookNum);
                    int textIndex = _projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                    TextInfo text;
                    if (textIndex == -1)
                    {
                        text = new TextInfo { BookNum = bookNum, HasSource = hasSource };
                    }
                    else
                        text = _projectDoc.Data.Texts[textIndex];

                    // update target text docs
                    if (!targetTextDocsByBook.TryGetValue(text.BookNum,
                        out SortedList<int, IDocument<TextData>> targetTextDocs))
                    {
                        targetTextDocs = new SortedList<int, IDocument<TextData>>();
                    }

                    List<Chapter> newChapters = await UpdateTextDocsAsync(text, TextType.Target, targetParatextId,
                        targetTextDocs);
                    if (hasSource)
                    {
                        // update source text docs
                        if (!sourceTextDocsByBook.TryGetValue(text.BookNum,
                            out SortedList<int, IDocument<TextData>> sourceTextDocs))
                        {
                            sourceTextDocs = new SortedList<int, IDocument<TextData>>();
                        }
                        var chaptersToInclude = new HashSet<int>(newChapters.Select(c => c.Number));
                        await UpdateTextDocsAsync(text, TextType.Source, targetParatextId, sourceTextDocs,
                            chaptersToInclude);
                    }

                    // update question docs
                    if (questionDocsByBook.TryGetValue(text.BookNum,
                        out IReadOnlyList<IDocument<Question>> questionDocs))
                    {
                        await UpdateQuestionDocsAsync(questionDocs, newChapters);
                    }

                    // update project metadata
                    await _projectDoc.SubmitJson0OpAsync(op =>
                    {
                        if (textIndex == -1)
                        {
                            // insert text info for new text
                            text.Chapters = newChapters;
                            op.Add(pd => pd.Texts, text);
                        }
                        else
                        {
                            // update text info
                            op.Set(pd => pd.Texts[textIndex].Chapters, newChapters, ChapterListEqualityComparer);
                            op.Set(pd => pd.Texts[textIndex].HasSource, hasSource);
                        }
                    });
                }

                if (TranslationSuggestionsEnabled && trainEngine)
                {
                    // start training Machine engine
                    await _engineService.StartBuildByProjectIdAsync(projectId);
                }

                await CompleteSync(true);
                CloseConnection();
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Error occurred while executing Paratext sync for project '{Project}'", projectId);
                if (silent)
                {
                    await _projectDoc.SubmitJson0OpAsync(op =>
                    {
                        op.Inc(pd => pd.Sync.QueuedCount, -1);
                        op.Unset(pd => pd.Sync.PercentCompleted);
                    });

                }
                else
                {
                    await CompleteSync(false);
                }
                CloseConnection();
                throw;
            }
        }

        internal async Task<bool> InitAsync(string projectId, string userId)
        {
            _conn = await _realtimeService.ConnectAsync();
            _projectDoc = await _conn.FetchAsync<SFProject>(projectId);
            if (!_projectDoc.IsLoaded)
                return false;

            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out _projectSecret))
                return false;

            if (!(await _userSecrets.TryGetAsync(userId)).TryResult(out _userSecret))
                return false;

            List<User> paratextUsers = await _realtimeService.QuerySnapshots<User>()
                .Where(u => _projectDoc.Data.UserRoles.Keys.Contains(u.Id) && u.ParatextId != null)
                .ToListAsync();
            await _notesMapper.InitAsync(_userSecret, _projectSecret, paratextUsers, _projectDoc.Data.ParatextId);

            await _projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.Sync.PercentCompleted, 0));
            return true;
        }

        internal void CloseConnection()
        {
            _conn?.Dispose();
        }

        private void UpdateParatextBook(TextInfo text, string paratextId, SortedList<int, IDocument<TextData>> textDocs)
        {
            string bookText = _paratextService.GetBookText(_userSecret, paratextId, text.BookNum, TextType.Target);
            var oldUsxDoc = XDocument.Parse(bookText);
            XDocument newUsxDoc = _deltaUsxMapper.ToUsx(oldUsxDoc, text.Chapters.OrderBy(c => c.Number)
                .Select(c => new ChapterDelta(c.Number, c.LastVerse, c.IsValid, textDocs[c.Number].Data)));

            if (!XNode.DeepEquals(oldUsxDoc, newUsxDoc))
                _paratextService.PutBookText(_userSecret, paratextId, text.BookNum, newUsxDoc.Root.ToString());
        }

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

        private async Task<List<Chapter>> UpdateTextDocsAsync(TextInfo text, TextType textType, string paratextId,
            SortedList<int, IDocument<TextData>> textDocs, ISet<int> chaptersToInclude = null)
        {
            string bookText = _paratextService.GetBookText(_userSecret, paratextId, text.BookNum, textType);
            var usxDoc = XDocument.Parse(bookText);
            var tasks = new List<Task>();
            Dictionary<int, ChapterDelta> deltas = _deltaUsxMapper.ToChapterDeltas(usxDoc)
                .ToDictionary(cd => cd.Number);
            var chapters = new List<Chapter>();
            foreach (KeyValuePair<int, ChapterDelta> kvp in deltas)
            {
                bool addChapter = true;
                if (textDocs.TryGetValue(kvp.Key, out IDocument<TextData> textDataDoc))
                {
                    Delta diffDelta = textDataDoc.Data.Diff(kvp.Value.Delta);
                    if (diffDelta.Ops.Count > 0)
                        tasks.Add(textDataDoc.SubmitOpAsync(diffDelta));
                    textDocs.Remove(kvp.Key);
                }
                else if (chaptersToInclude == null || chaptersToInclude.Contains(kvp.Key))
                {
                    textDataDoc = GetTextDoc(text, kvp.Key, textType);
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
                        IsValid = kvp.Value.IsValid
                    });
                }
            }
            foreach (KeyValuePair<int, IDocument<TextData>> kvp in textDocs)
            {
                tasks.Add(kvp.Value.DeleteAsync());
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
        internal async Task<SortedList<int, IDocument<TextData>>> FetchTextDocsAsync(TextInfo text,
            TextType textType)
        {
            var textDocs = new SortedList<int, IDocument<TextData>>();
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
            {
                IDocument<TextData> textDoc = GetTextDoc(text, chapter.Number, textType);
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
        private async Task DeleteAllTextDocsForBookAsync(TextInfo text, TextType textType)
        {
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
                tasks.Add(DeleteTextDocAsync(text, chapter.Number, textType));
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

        private async Task CompleteSync(bool successful)
        {
            if (_projectDoc == null || _projectSecret == null)
                return;

            IReadOnlyDictionary<string, string> ptUserRoles = await _paratextService.GetProjectRolesAsync(_userSecret,
                _projectDoc.Data.ParatextId);
            var userIdsToRemove = new List<string>();
            var projectUsers = await _realtimeService.QuerySnapshots<User>()
                    .Where(u => _projectDoc.Data.UserRoles.Keys.Contains(u.Id) && u.ParatextId != null)
                    .Select(u => new { UserId = u.Id, ParatextId = u.ParatextId })
                    .ToListAsync();

            await _projectDoc.SubmitJson0OpAsync(op =>
            {
                op.Unset(pd => pd.Sync.PercentCompleted);
                op.Set(pd => pd.Sync.LastSyncSuccessful, successful);
                if (successful)
                    op.Set(pd => pd.Sync.DateLastSuccessfulSync, DateTime.UtcNow);
                // the frontend checks the queued count to determine if the sync is complete. The ShareDB client emits
                // an event for each individual op even if they are applied as a batch, so this needs to be set last,
                // otherwise the info about the sync won't be set yet when the frontend determines that the sync is
                // complete.
                op.Inc(pd => pd.Sync.QueuedCount, -1);

                foreach (var projectUser in projectUsers)
                {
                    if (ptUserRoles.TryGetValue(projectUser.ParatextId, out string role))
                        op.Set(p => p.UserRoles[projectUser.UserId], role);
                    else if (_projectDoc.Data.UserRoles[projectUser.UserId].StartsWith("pt"))
                        userIdsToRemove.Add(projectUser.UserId);
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
                });
            }
        }

        private IDocument<TextData> GetTextDoc(TextInfo text, int chapter, TextType textType)
        {
            return _conn.Get<TextData>(TextData.GetTextDocId(_projectDoc.Id, text.BookNum, chapter, textType));
        }

        private async Task DeleteTextDocAsync(TextInfo text, int chapter, TextType textType)
        {
            IDocument<TextData> textDoc = GetTextDoc(text, chapter, textType);
            await textDoc.FetchAsync();
            if (textDoc.IsLoaded)
                await textDoc.DeleteAsync();
        }

        private SyncProgress UseNewProgress()
        {
            var progress = new SyncProgress();
            progress.ProgressUpdated += (object sender, EventArgs e) =>
            {
                if (_projectDoc == null)
                    return;
                double percentCompleted = progress.ProgressValue;
                if (percentCompleted >= 0)
                    _projectDoc.SubmitJson0OpAsync(op => op.Set(pd => pd.Sync.PercentCompleted, percentCompleted));
            };

            return progress;
        }

        private class ChapterEqualityComparer : IEqualityComparer<Chapter>
        {
            public bool Equals(Chapter x, Chapter y)
            {
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
    }
}
