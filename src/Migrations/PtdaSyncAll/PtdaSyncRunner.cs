using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SIL.Machine.WebApi.Services;
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
using SIL.XForge.Scripture.Services;
using System.Text;

namespace PtdaSyncAll
{
    /// <summary>
    /// Copied and modified from ParatextSyncRunner.cs to synchronize all projects before cloning projects
    /// using Paratext Data dlls
    ///
    /// This class syncs real-time text and question docs with the Paratext data access API.
    ///
    /// Text sync (two-way):
    /// 1. The text deltas from the real-time docs are converted to USX.
    /// 2. The USX is sent to the PT data access API if the USX has changed since the last sync (this is determined by
    /// checking the new USX against a stored copy of the USX from the last sync).
    /// 3. The PT data access API merges the USX with any other changes and returns the merged USX.
    /// 4. The returned USX is converted back to text deltas and diffed against the current deltas.
    /// 5. The diff is submitted as an operation to the real-time text docs.
    ///
    /// Notes sync (one-way):
    /// 1. The current notes are retrieved from the PT data access API.
    /// 2. A notes changelist XML is generated from the real-time question docs.
    /// 3. The notes changelist is sent to the PT data access API.
    ///
    /// Target and source refer to child and mother translation data. Not
    /// to be confused with a target or source for where data is coming
    /// from or going to when fetching or syncing.
    /// </summary>
    public class PtdaSyncRunner : IParatextSyncRunner
    {
        private static readonly IEqualityComparer<List<Chapter>> ChapterListEqualityComparer =
            SequenceEqualityComparer.Create(new ChapterEqualityComparer());

        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly ISFProjectService _projectService;
        private readonly IEngineService _engineService;
        private readonly IParatextService _paratextService;
        private readonly IRealtimeService _realtimeService;
        private readonly IDeltaUsxMapper _deltaUsxMapper;
        private readonly IParatextNotesMapper _notesMapper;
        private readonly IFileSystemService _fileSystemService;
        private readonly ILogger<PtdaSyncRunner> _logger;

        private IConnection _conn;
        private UserSecret _userSecret;
        private IDocument<SFProject> _projectDoc;
        private SFProjectSecret _projectSecret;
        private int _stepCount;
        private int _step;

        public PtdaSyncRunner(
            IOptions<SiteOptions> siteOptions,
            IRepository<UserSecret> userSecrets,
            IRepository<SFProjectSecret> projectSecrets,
            ISFProjectService projectService,
            IEngineService engineService,
            IParatextService paratextService,
            IRealtimeService realtimeService,
            IFileSystemService fileSystemService,
            IDeltaUsxMapper deltaUsxMapper,
            IParatextNotesMapper notesMapper,
            ILogger<PtdaSyncRunner> logger
        )
        {
            _siteOptions = siteOptions;
            _userSecrets = userSecrets;
            _projectSecrets = projectSecrets;
            _projectService = projectService;
            _engineService = engineService;
            _paratextService = paratextService;
            _realtimeService = realtimeService;
            _fileSystemService = fileSystemService;
            _logger = logger;
            _deltaUsxMapper = deltaUsxMapper;
            _notesMapper = notesMapper;
        }

        private string WorkingDir => Path.Combine(_siteOptions.Value.SiteDir, "sync");

        private bool TranslationSuggestionsEnabled => _projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled;
        private bool CheckingEnabled => _projectDoc.Data.CheckingConfig.CheckingEnabled;

        // Do not allow multiple sync jobs to run in parallel on the same project by creating a mutex on the projectId
        // parameter, i.e. "{0}"
        [Mutex("{0}")]
        public async Task RunAsync(string projectId, string userId, bool trainEngine)
        {
            try
            {
                if (!await InitAsync(projectId, userId))
                {
                    await CompleteSync(false);
                    return;
                }

                string targetParatextId = _projectDoc.Data.ParatextId;
                string sourceParatextId = _projectDoc.Data.TranslateConfig.Source?.ParatextId;

                var targetBooks = new HashSet<int>(
                    (await _paratextService.GetBooksAsync(_userSecret, targetParatextId)).Select(
                        bookId => Canon.BookIdToNumber(bookId)
                    )
                );

                var sourceBooks = new HashSet<int>(
                    TranslationSuggestionsEnabled
                        ? (await _paratextService.GetBooksAsync(_userSecret, sourceParatextId)).Select(
                            bookId => Canon.BookIdToNumber(bookId)
                        )
                        : Enumerable.Empty<int>()
                );
                sourceBooks.IntersectWith(targetBooks);

                var targetBooksToDelete = new HashSet<int>(GetBooksToDelete(TextType.Target, targetBooks));
                var sourceBooksToDelete = new HashSet<int>(
                    TranslationSuggestionsEnabled
                        ? GetBooksToDelete(TextType.Source, sourceBooks)
                        : Enumerable.Empty<int>()
                );

                _step = 0;
                _stepCount = (targetBooks.Count * (CheckingEnabled ? 3 : 2)) + (sourceBooks.Count * 2);
                if (targetBooksToDelete.Count > 0 || sourceBooksToDelete.Count > 0)
                {
                    _stepCount += 1;

                    // delete source books
                    foreach (int bookNum in sourceBooksToDelete)
                    {
                        TextInfo text = _projectDoc.Data.Texts.First(t => t.BookNum == bookNum);
                        await DeleteAllTextDataForBookAsync(text, TextType.Source);
                    }
                    // delete target books
                    foreach (int bookNum in targetBooksToDelete)
                    {
                        int textIndex = _projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                        TextInfo text = _projectDoc.Data.Texts[textIndex];
                        await _projectDoc.SubmitJson0OpAsync(op => op.Remove(pd => pd.Texts, textIndex));

                        await DeleteAllTextDataForBookAsync(text, TextType.Target);
                        await DeleteAllQuestionsDocsForBookAsync(text);
                    }
                    await UpdateProgress();
                }

                // sync source and target books
                foreach (int bookNum in targetBooks)
                {
                    bool hasSource = sourceBooks.Contains(bookNum);
                    int textIndex = _projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                    TextInfo text;
                    if (textIndex == -1)
                        text = new TextInfo { BookNum = bookNum, HasSource = hasSource };
                    else
                        text = _projectDoc.Data.Texts[textIndex];

                    List<Chapter> newChapters = await SyncOrCloneBookUsxAsync(
                        text,
                        TextType.Target,
                        targetParatextId,
                        false
                    );
                    if (newChapters != null)
                    {
                        if (hasSource)
                        {
                            var chaptersToInclude = new HashSet<int>(newChapters.Select(c => c.Number));
                            await SyncOrCloneBookUsxAsync(
                                text,
                                TextType.Source,
                                sourceParatextId,
                                true,
                                chaptersToInclude
                            );
                        }
                        await UpdateNotesData(text, newChapters);
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
                }

                if (TranslationSuggestionsEnabled && trainEngine)
                {
                    // start training Machine engine
                    await _engineService.StartBuildByProjectIdAsync(projectId);
                }

                await CompleteSync(true);
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Error occurred while executing Paratext sync for project '{Project}'", projectId);
                await CompleteSync(false);
            }
            finally
            {
                CloseConnection();
            }
        }

        public async Task<bool> InitAsync(string projectId, string userId)
        {
            _conn = await _realtimeService.ConnectAsync();
            _projectDoc = await _conn.FetchAsync<SFProject>(projectId);
            if (!_projectDoc.IsLoaded)
                return false;

            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out _projectSecret))
                return false;

            if (!(await _userSecrets.TryGetAsync(userId)).TryResult(out _userSecret))
                return false;

            List<User> paratextUsers = await _realtimeService
                .QuerySnapshots<User>()
                .Where(u => _projectDoc.Data.UserRoles.Keys.Contains(u.Id) && u.ParatextId != null)
                .ToListAsync();
            await _notesMapper.InitAsync(_userSecret, _projectSecret, paratextUsers, _projectDoc.Data.ParatextId);

            await _projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.Sync.PercentCompleted, 0));

            if (!_fileSystemService.DirectoryExists(WorkingDir))
                _fileSystemService.CreateDirectory(WorkingDir);
            return true;
        }

        public void CloseConnection()
        {
            _conn?.Dispose();
        }

        private async Task<List<Chapter>> SyncOrCloneBookUsxAsync(
            TextInfo text,
            TextType textType,
            string paratextId,
            bool isReadOnly,
            ISet<int> chaptersToInclude = null
        )
        {
            string projectPath = GetProjectPath(textType);
            if (!_fileSystemService.DirectoryExists(projectPath))
                _fileSystemService.CreateDirectory(projectPath);

            string fileName = GetUsxFileName(projectPath, text.BookNum);

            bool fileExists = _fileSystemService.FileExists(fileName);
            if (fileExists && text.Chapters.Count < 1)
            {
                Console.WriteLine(
                    $"SyncOrCloneBookUsxAsync: Warning: When processing textinfo booknum {text.BookNum}, "
                        + $"chapters {text.Chapters.Count}, texttype {textType}, for paratext project id {paratextId}, "
                        + $"the text chapter count was 0 but there was already a file at {fileName}. Perhaps indicating "
                        + $"a prior failed clone. Going to try cloning it again, rather than syncing."
                );
            }

            if (fileExists && text.Chapters.Count > 0)
            {
                return await SyncBookUsxAsync(text, textType, paratextId, fileName, isReadOnly, chaptersToInclude);
            }
            else
            {
                try
                {
                    return await CloneBookUsxAsync(text, textType, paratextId, fileName, chaptersToInclude);
                }
                catch (Exception)
                {
                    string bookName = Canon.BookNumberToId(text.BookNum);
                    _logger.LogWarning($"Failed to clone a book: {bookName}. Skipping...");
                    // We can skip cloning new books to this project folder (they get cloned
                    // with the whole project in the following clone all migration step)
                    return null;
                }
            }
        }

        public async Task<List<Chapter>> SyncBookUsxAsync(
            TextInfo text,
            TextType textType,
            string paratextId,
            string fileName,
            bool isReadOnly,
            ISet<int> chaptersToInclude
        )
        {
            if (text.Chapters.Count < 1)
            {
                // The SF DB is corrupt. Also, the project doc in the SF DB has no record of any chapters that
                // we could synchronize.
                SortedList<int, IDocument<TextData>> allTextDocsForBook = await PessimisticallyFetchTextDocsAsync(
                    text,
                    textType
                );
                if (allTextDocsForBook.Count < 1)
                {
                    // We don't have any chapter text docs for the book in the SF DB.
                    _logger.LogWarning(
                        "SyncBookUsxAsync() detected a corrupt SF DB for project with paratext id "
                            + $"{paratextId}, for book {text.BookNum}, TextType {textType}, because the TextInfo has an "
                            + $"invalid chapter count of {text.Chapters.Count}. There aren't any chapter text docs for "
                            + $"this book in the DB anyway though. Returning null to skip fetching or syncing this book."
                    );
                    return null;
                }
                else
                {
                    // We have chapter text docs for the book in the SF DB that the project doc did not know were there.
                    // Throw an error and there may need to be a manual investigation to know how to sync this project.
                    throw new Exception(
                        "SyncBookUsxAsync() stopped because there are chapter text docs for a "
                            + $"project's book that are not known about by the project doc. And the project doc has an "
                            + $"invalid description of book chapters. TextInfo booknum is {text.BookNum}. "
                            + $"Text type is {textType}. Paratext project id is {paratextId}. The project TextInfo knows "
                            + $"about {text.Chapters.Count} chapters, but in the DB there are {allTextDocsForBook.Count} "
                            + "chapters for the book."
                    );
                }
            }

            SortedList<int, IDocument<TextData>> dbChapterDocs = await FetchTextDocsAsync(text, textType);

            string bookId = Canon.BookNumberToId(text.BookNum);
            string ptBookText = await FetchFromAndUpdateParatextAsync(
                text,
                paratextId,
                fileName,
                isReadOnly,
                bookId,
                dbChapterDocs
            );
            if (ptBookText == null)
            {
                return null;
            }
            await UpdateProgress();

            XElement bookTextElem = ParseText(ptBookText);
            var usxDoc = new XDocument(bookTextElem.Element("usx"));
            Dictionary<int, ChapterDelta> incomingChapters = _deltaUsxMapper
                .ToChapterDeltas(usxDoc)
                .ToDictionary(cd => cd.Number);

            // Set SF DB to snapshot from Paratext.
            List<Chapter> chapters = await ChangeDbToNewSnapshotAsync(
                text,
                textType,
                chaptersToInclude,
                dbChapterDocs,
                incomingChapters
            );

            // Save to disk
            await SaveXmlFileAsync(bookTextElem, fileName);

            await UpdateProgress();
            return chapters;
        }

        private async Task<string> FetchFromAndUpdateParatextAsync(
            TextInfo text,
            string paratextId,
            string fileName,
            bool isReadOnly,
            string bookId,
            SortedList<int, IDocument<TextData>> dbChapterDocs
        )
        {
            XElement bookTextElem;
            string ptBookText;
            if (isReadOnly)
            {
                ptBookText = await _paratextService.GetBookTextAsync(_userSecret, paratextId, bookId);
            }
            else
            {
                bookTextElem = await LoadXmlFileAsync(fileName);

                var oldUsxDoc = new XDocument(bookTextElem.Element("usx"));
                XDocument newUsxDoc = _deltaUsxMapper.ToUsx(
                    oldUsxDoc,
                    text.Chapters
                        .OrderBy(c => c.Number)
                        .Select(c => new ChapterDelta(c.Number, c.LastVerse, c.IsValid, dbChapterDocs[c.Number].Data))
                );

                var revision = (string)bookTextElem.Attribute("revision");

                if (XNode.DeepEquals(oldUsxDoc, newUsxDoc))
                {
                    // We don't have any text changes to send to PT. If we fail to fetch an update to PT here, we can
                    // just not worry about it, move on, and let the text be written to/updated by the stage2 migration.
                    try
                    {
                        ptBookText = await _paratextService.GetBookTextAsync(_userSecret, paratextId, bookId);
                    }
                    catch (Exception e)
                    {
                        _logger.LogWarning(
                            "PtdaSyncRunner FetchFromAndUpdateParatextAsync() failed to fetch PT book "
                                + $"text (bookId {bookId}, textinfo BookNum {text.BookNum}, "
                                + $"textinfo chapters count {text.Chapters.Count()}), but for a book with no SF changes "
                                + $"to upload. Skipping. The exception message is: {e.Message}"
                        );
                        return null;
                    }
                }
                else
                {
                    // Output the chapter doc change to upload, to add context for what to do if problems arise.
                    string tempOldUsxFile = "/tmp/old.usx";
                    string tempNewUsxFile = "/tmp/new.usx";
                    using (var oldWriter = new StringWriter())
                    {
                        oldUsxDoc.Save(oldWriter);
                        File.WriteAllText(tempOldUsxFile, oldWriter.ToString().Replace("<", "\n<"));
                    }
                    using (var newWriter = new StringWriter())
                    {
                        newUsxDoc.Save(newWriter);
                        File.WriteAllText(tempNewUsxFile, newWriter.ToString().Replace("<", "\n<"));
                    }

                    using (
                        Process diffProcess = new Process()
                        {
                            StartInfo = new ProcessStartInfo
                            {
                                FileName = "/usr/bin/diff",
                                Arguments = $"-u {tempOldUsxFile} {tempNewUsxFile}",
                                UseShellExecute = false,
                                CreateNoWindow = true,
                                RedirectStandardOutput = true
                            }
                        }
                    )
                    {
                        diffProcess.Start();
                        string diff = diffProcess.StandardOutput.ReadToEnd();
                        diffProcess.WaitForExit();
                        Console.WriteLine(
                            "FetchFromAndUpdateParatextAsync has some SF book text to send to PT "
                                + $"pt project id {paratextId}, bookId {bookId}, dbChapterDocs count {dbChapterDocs.Count}. "
                                + $"That diff is: \n{diff}"
                        );
                    }

                    var skipUpdate = Environment.GetEnvironmentVariable("SKIPSYNCBOOK");
                    if (skipUpdate == "skip")
                    {
                        // Diffs will be recorded in the logs so we can evaluate if any changes were significant
                        // and need to be addressed post-migration
                        Console.WriteLine(
                            $"Skip pushing edits from SF to Paratext." + $"BookId: {bookId} ParatextId: {paratextId}"
                        );
                        return null;
                    }
                    else
                    {
                        ptBookText = await _paratextService.UpdateBookTextAsync(
                            _userSecret,
                            paratextId,
                            bookId,
                            revision,
                            newUsxDoc.Root.ToString()
                        );
                    }
                }
            }
            return ptBookText;
        }

        public async Task<List<Chapter>> ChangeDbToNewSnapshotAsync(
            TextInfo text,
            TextType textType,
            ISet<int> chaptersToInclude,
            SortedList<int, IDocument<TextData>> dbChapterDocs,
            Dictionary<int, ChapterDelta> incomingChapters
        )
        {
            Debug.Assert(dbChapterDocs.All(chapter => chapter.Value.IsLoaded), "Docs must be loaded from the DB.");
            Debug.Assert(
                incomingChapters.All(incomingChapter => incomingChapter.Value.Delta != null),
                "Incoming chapter deltas cannot be null. Maybe DeltaUsxMapper.ToChapterDeltas() has a bug?"
            );

            var tasks = new List<Task>();
            var chapters = new List<Chapter>();
            foreach (KeyValuePair<int, ChapterDelta> incomingChapter in incomingChapters)
            {
                if (dbChapterDocs.TryGetValue(incomingChapter.Key, out IDocument<TextData> dbChapterDoc))
                {
                    Delta diffDelta = dbChapterDoc.Data.Diff(incomingChapter.Value.Delta);
                    if (diffDelta.Ops.Count > 0)
                    {
                        tasks.Add(dbChapterDoc.SubmitOpAsync(diffDelta));
                    }
                    dbChapterDocs.Remove(incomingChapter.Key);
                }
                else if (chaptersToInclude == null || chaptersToInclude.Contains(incomingChapter.Key))
                {
                    // Set database to content from Paratext.
                    dbChapterDoc = GetTextDoc(text, incomingChapter.Key, textType);
                    tasks.Add(dbChapterDoc.CreateAsync(new TextData(incomingChapter.Value.Delta)));
                }
                chapters.Add(
                    new Chapter
                    {
                        Number = incomingChapter.Key,
                        LastVerse = incomingChapter.Value.LastVerse,
                        IsValid = incomingChapter.Value.IsValid
                    }
                );
            }
            foreach (KeyValuePair<int, IDocument<TextData>> dbChapterDoc in dbChapterDocs)
            {
                tasks.Add(dbChapterDoc.Value.DeleteAsync());
            }
            await Task.WhenAll(tasks);
            return chapters;
        }

        /// <summary>
        /// Fetches all text docs from the database for a book.
        /// </summary>
        public async Task<SortedList<int, IDocument<TextData>>> FetchTextDocsAsync(TextInfo text, TextType textType)
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
        /// Tries to fetch text docs for a book, but for lots of chapters, ignoring the chapters that the
        /// TextInfo claims would be there.
        /// </summary>
        private async Task<SortedList<int, IDocument<TextData>>> PessimisticallyFetchTextDocsAsync(
            TextInfo text,
            TextType textType
        )
        {
            int firstPossibleChapter = 1;
            int lastPossibleChapter = 150;

            var textDocs = new SortedList<int, IDocument<TextData>>();
            var tasks = new List<Task>();
            for (int chapter = firstPossibleChapter; chapter <= lastPossibleChapter; chapter++)
            {
                IDocument<TextData> textDoc = GetTextDoc(text, chapter, textType);
                textDocs[chapter] = textDoc;
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

        private async Task<List<Chapter>> CloneBookUsxAsync(
            TextInfo text,
            TextType textType,
            string paratextId,
            string fileName,
            ISet<int> chaptersToInclude
        )
        {
            // Remove any stale text_data records that may be in the way.
            await DeleteAllTextDocsForBookAsync(text, textType);

            string bookText = await _paratextService.GetBookTextAsync(
                _userSecret,
                paratextId,
                Canon.BookNumberToId(text.BookNum)
            );
            var bookTextElem = ParseText(bookText);
            await UpdateProgress();

            var usxDoc = new XDocument(bookTextElem.Element("usx"));
            Dictionary<int, ChapterDelta> deltas = _deltaUsxMapper
                .ToChapterDeltas(usxDoc)
                .ToDictionary(cd => cd.Number);
            var tasks = new List<Task>();
            var chapters = new List<Chapter>();
            foreach (KeyValuePair<int, ChapterDelta> kvp in deltas)
            {
                if (chaptersToInclude != null && !chaptersToInclude.Contains(kvp.Key))
                    continue;

                async Task createText(int chapterNum, Delta delta)
                {
                    IDocument<TextData> textDataDoc = GetTextDoc(text, chapterNum, textType);
                    await textDataDoc.FetchAsync();
                    if (textDataDoc.IsLoaded)
                    {
                        Console.WriteLine(
                            $"CloneBookUsxAsync: Going to delete text doc before re-creating it. "
                                + $"FYI that it and its contents are: textinfo booknum {text.BookNum}, "
                                + $"chapter count {text.Chapters.Count}, has source {text.HasSource}, "
                                + $"int chapterNum: {chapterNum}, text type: {textType}, paratext project id {paratextId}. "
                                + $"Contents: {textDataDoc.Data.ToString()} END_CONTENTS."
                        );
                        await textDataDoc.DeleteAsync();
                    }
                    await textDataDoc.CreateAsync(new TextData(delta));
                }
                tasks.Add(createText(kvp.Key, kvp.Value.Delta));
                chapters.Add(
                    new Chapter
                    {
                        Number = kvp.Key,
                        LastVerse = kvp.Value.LastVerse,
                        IsValid = kvp.Value.IsValid
                    }
                );
            }
            await Task.WhenAll(tasks);

            await SaveXmlFileAsync(bookTextElem, fileName);

            await UpdateProgress();
            return chapters;
        }

        /// <summary>
        /// Deletes the cached USX file from the disk and all text docs from the database for a book.
        /// </summary>
        private async Task DeleteAllTextDataForBookAsync(TextInfo text, TextType textType)
        {
            string projectPath = GetProjectPath(textType);
            _fileSystemService.DeleteFile(GetUsxFileName(projectPath, text.BookNum));
            await DeleteAllTextDocsForBookAsync(text, textType);
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

        private async Task UpdateNotesData(TextInfo text, List<Chapter> newChapters)
        {
            IReadOnlyList<IDocument<Question>> allQuestionDocs = await FetchQuestionDocsAsync(text);

            // handle deletion of chapters
            var chapterNums = new HashSet<int>(newChapters.Select(c => c.Number));
            var tasks = new List<Task>();
            foreach (IDocument<Question> questionDoc in allQuestionDocs)
            {
                if (!chapterNums.Contains(questionDoc.Data.VerseRef.ChapterNum))
                    tasks.Add(questionDoc.DeleteAsync());
            }
            await Task.WhenAll(tasks);

            if (CheckingEnabled)
            {
                XElement oldNotesElem;
                string oldNotesText = await _paratextService.GetNotesAsync(
                    _userSecret,
                    _projectDoc.Data.ParatextId,
                    Canon.BookNumberToId(text.BookNum)
                );
                if (oldNotesText != "")
                    oldNotesElem = ParseText(oldNotesText);
                else
                    oldNotesElem = new XElement("notes", new XAttribute("version", "1.1"));

                XElement notesElem = await _notesMapper.GetNotesChangelistAsync(oldNotesElem, allQuestionDocs);

                if (notesElem.Elements("thread").Any())
                {
                    await _paratextService.UpdateNotesAsync(
                        _userSecret,
                        _projectDoc.Data.ParatextId,
                        notesElem.ToString()
                    );
                }

                await UpdateProgress();
            }
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
        }

        /// <summary>
        /// Gets all books that need to be deleted.
        /// </summary>
        private IEnumerable<int> GetBooksToDelete(TextType textType, IEnumerable<int> existingBooks)
        {
            string projectPath = GetProjectPath(textType);
            var booksToDelete = new HashSet<int>(
                _fileSystemService.DirectoryExists(projectPath)
                    ? _fileSystemService
                        .EnumerateFiles(projectPath)
                        .Select(p => Canon.BookIdToNumber(Path.GetFileNameWithoutExtension(p)))
                    : Enumerable.Empty<int>()
            );
            booksToDelete.ExceptWith(existingBooks);
            return booksToDelete;
        }

        private async Task CompleteSync(bool successful)
        {
            if (_projectDoc == null || _projectSecret == null)
                return;

            IReadOnlyDictionary<string, string> ptUserRoles = await _paratextService.GetProjectRolesAsync(
                _userSecret,
                _projectDoc.Data.ParatextId
            );
            var userIdsToRemove = new List<string>();
            var projectUsers = await _realtimeService
                .QuerySnapshots<User>()
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
                await _projectSecrets.UpdateAsync(
                    _projectSecret.Id,
                    u =>
                    {
                        foreach (SyncUser syncUser in _notesMapper.NewSyncUsers)
                            u.Add(p => p.SyncUsers, syncUser);
                    }
                );
            }
        }

        private string GetProjectPath(TextType textType)
        {
            string textTypeDir;
            switch (textType)
            {
                case TextType.Source:
                    textTypeDir = "source";
                    break;
                case TextType.Target:
                    textTypeDir = "target";
                    break;
                default:
                    throw new InvalidEnumArgumentException(nameof(textType), (int)textType, typeof(TextType));
            }
            return Path.Combine(WorkingDir, _projectDoc.Id, textTypeDir);
        }

        private static string GetUsxFileName(string projectPath, int bookNum)
        {
            return Path.Combine(projectPath, Canon.BookNumberToId(bookNum) + ".xml");
        }

        private async Task<XElement> LoadXmlFileAsync(string fileName)
        {
            using (Stream stream = _fileSystemService.OpenFile(fileName, FileMode.Open))
            {
                return await XElement.LoadAsync(stream, LoadOptions.PreserveWhitespace, CancellationToken.None);
            }
        }

        private async Task SaveXmlFileAsync(XElement bookTextElem, string fileName)
        {
            using (Stream stream = _fileSystemService.CreateFile(fileName))
            {
                await bookTextElem.SaveAsync(stream, SaveOptions.DisableFormatting, CancellationToken.None);
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

        private async Task UpdateProgress()
        {
            if (_projectDoc == null)
                return;
            _step++;
            double percentCompleted = Math.Round((double)_step / _stepCount, 2, MidpointRounding.AwayFromZero);
            await _projectDoc.SubmitJson0OpAsync(op => op.Set(pd => pd.Sync.PercentCompleted, percentCompleted));
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
