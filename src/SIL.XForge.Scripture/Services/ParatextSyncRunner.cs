using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SIL.Machine.WebApi.Services;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
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
    /// This class syncs real-time text, questions, and comments docs with the Paratext data access API.
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
    /// 2. A notes changelist XML is generated from the real-time questions and comments docs.
    /// 3. The notes changelist is sent to the PT data access API.
    /// </summary>
    public class ParatextSyncRunner
    {
        private static readonly Dictionary<string, string> BookNames = new Dictionary<string, string>
        {
            { "GEN", "Genesis" },
            { "EXO", "Exodus" },
            { "LEV", "Leviticus" },
            { "NUM", "Numbers" },
            { "DEU", "Deuteronomy" },
            { "JOS", "Joshua" },
            { "JDG", "Judges" },
            { "RUT", "Ruth" },
            { "1SA", "1 Samuel" },
            { "2SA", "2 Samuel" },
            { "1KI", "1 Kings" },
            { "2KI", "2 Kings" },
            { "1CH", "1 Chronicles" },
            { "2CH", "2 Chronicles" },
            { "EZR", "Ezra" },
            { "NEH", "Nehemiah" },
            { "EST", "Esther" },
            { "JOB", "Job" },
            { "PSA", "Psalm" },
            { "PRO", "Proverbs" },
            { "ECC", "Ecclesiastes" },
            { "SNG", "Song of Songs" },
            { "ISA", "Isaiah" },
            { "JER", "Jeremiah" },
            { "LAM", "Lamentations" },
            { "EZK", "Ezekiel" },
            { "DAN", "Daniel" },
            { "HOS", "Hosea" },
            { "JOL", "Joel" },
            { "AMO", "Amos" },
            { "OBA", "Obadiah" },
            { "JON", "Jonah" },
            { "MIC", "Micah" },
            { "NAM", "Nahum" },
            { "HAB", "Habakkuk" },
            { "ZEP", "Zephaniah" },
            { "HAG", "Haggai" },
            { "ZEC", "Zechariah" },
            { "MAL", "Malachi" },
            { "MAT", "Matthew" },
            { "MRK", "Mark" },
            { "LUK", "Luke" },
            { "JHN", "John" },
            { "ACT", "Acts" },
            { "ROM", "Romans" },
            { "1CO", "1 Corinthians" },
            { "2CO", "2 Corinthians" },
            { "GAL", "Galatians" },
            { "EPH", "Ephesians" },
            { "PHP", "Philippians" },
            { "COL", "Colossians" },
            { "1TH", "1 Thessalonians" },
            { "2TH", "2 Thessalonians" },
            { "1TI", "1 Timothy" },
            { "2TI", "2 Timothy" },
            { "TIT", "Titus" },
            { "PHM", "Philemon" },
            { "HEB", "Hebrews" },
            { "JAS", "James" },
            { "1PE", "1 Peter" },
            { "2PE", "2 Peter" },
            { "1JN", "1 John" },
            { "2JN", "2 John" },
            { "3JN", "3 John" },
            { "JUD", "Jude" },
            { "REV", "Revelation" },
            { "TOB", "Tobit" },
            { "JDT", "Judith" },
            { "ESG", "Esther (Greek)" },
            { "WIS", "The Wisdom of Solomon" },
            { "SIR", "Sirach" },
            { "BAR", "Baruch" },
            { "LJE", "Letter of Jeremiah" },
            { "S3Y", "Song of Three Young Men" },
            { "SUS", "Susanna" },
            { "BEL", "Bel and the Dragon" },
            { "1MA", "1 Maccabees" },
            { "2MA", "2 Maccabees" },
            { "1ES", "1 Esdras" },
            { "2ES", "2 Esdras" },
            { "MAN", "The Prayer of Manasseh" }
        };

        private static readonly IEqualityComparer<List<Chapter>> ChapterListEqualityComparer =
            SequenceEqualityComparer.Create(new ChapterEqualityComparer());

        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<SFProjectEntity> _projects;
        private readonly IEngineService _engineService;
        private readonly IParatextService _paratextService;
        private readonly IRealtimeService _realtimeService;
        private readonly IDeltaUsxMapper _deltaUsxMapper;
        private readonly IParatextNotesMapper _notesMapper;
        private readonly IFileSystemService _fileSystemService;
        private readonly ILogger<ParatextSyncRunner> _logger;

        private IConnection _conn;
        private SFProjectEntity _project;
        private UserSecret _userSecret;
        private IDocument<SFProjectData> _projectDataDoc;
        private int _stepCount;
        private int _step;

        public ParatextSyncRunner(IOptions<SiteOptions> siteOptions, IRepository<UserSecret> userSecrets,
            IRepository<SFProjectEntity> projects, IEngineService engineService, IParatextService paratextService,
            IRealtimeService realtimeService, IFileSystemService fileSystemService, IDeltaUsxMapper deltaUsxMapper,
            IParatextNotesMapper notesMapper, ILogger<ParatextSyncRunner> logger)
        {
            _siteOptions = siteOptions;
            _userSecrets = userSecrets;
            _projects = projects;
            _engineService = engineService;
            _paratextService = paratextService;
            _realtimeService = realtimeService;
            _fileSystemService = fileSystemService;
            _logger = logger;
            _deltaUsxMapper = deltaUsxMapper;
            _notesMapper = notesMapper;
        }

        private string WorkingDir => Path.Combine(_siteOptions.Value.SiteDir, "sync");

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

                string targetParatextId = _project.ParatextId;
                var targetBooks = new HashSet<string>(await _paratextService.GetBooksAsync(_userSecret,
                    targetParatextId));

                string sourceParatextId = _project.SourceParatextId;
                var sourceBooks = new HashSet<string>(_project.TranslateEnabled
                    ? await _paratextService.GetBooksAsync(_userSecret, sourceParatextId)
                    : Enumerable.Empty<string>());

                var booksToSync = new HashSet<string>(targetBooks);
                if (!_project.CheckingEnabled)
                    booksToSync.IntersectWith(sourceBooks);

                var targetBooksToDelete = new HashSet<string>(GetBooksToDelete(TextType.Target, booksToSync));
                var sourceBooksToDelete = new HashSet<string>(_project.TranslateEnabled
                    ? GetBooksToDelete(TextType.Source, booksToSync)
                    : Enumerable.Empty<string>());

                _step = 0;
                _stepCount = (booksToSync.Count * (_project.CheckingEnabled ? 3 : 2))
                    + (sourceBooks.Intersect(booksToSync).Count() * 2);
                if (targetBooksToDelete.Count > 0 || sourceBooksToDelete.Count > 0)
                {
                    _stepCount += 1;

                    // delete source books
                    foreach (string bookId in sourceBooksToDelete)
                    {
                        TextInfo text = _projectDataDoc.Data.Texts.First(t => t.BookId == bookId);
                        await DeleteAllTextDataForBookAsync(text, TextType.Source);
                    }
                    // delete target books
                    foreach (string bookId in targetBooksToDelete)
                    {
                        int textIndex = _projectDataDoc.Data.Texts.FindIndex(t => t.BookId == bookId);
                        TextInfo text = _projectDataDoc.Data.Texts[textIndex];
                        await _projectDataDoc.SubmitJson0OpAsync(op => op.Remove(pd => pd.Texts, textIndex));

                        await DeleteAllTextDataForBookAsync(text, TextType.Target);
                        await DeleteAllNotesDocsForBookAsync(text);
                    }
                    await UpdateProgress();
                }

                // sync source and target books
                foreach (string bookId in booksToSync)
                {
                    if (!BookNames.TryGetValue(bookId, out string name))
                        name = bookId;

                    bool hasSource = sourceBooks.Contains(bookId);
                    int textIndex = _projectDataDoc.Data.Texts.FindIndex(t => t.BookId == bookId);
                    TextInfo text;
                    if (textIndex == -1)
                        text = new TextInfo { BookId = bookId, Name = name, HasSource = hasSource };
                    else
                        text = _projectDataDoc.Data.Texts[textIndex];

                    List<Chapter> newChapters = await SyncOrCloneBookUsxAsync(text, TextType.Target, targetParatextId,
                        false);
                    if (hasSource)
                    {
                        var chaptersToInclude = new HashSet<int>(newChapters.Select(c => c.Number));
                        await SyncOrCloneBookUsxAsync(text, TextType.Source, sourceParatextId, true, chaptersToInclude);
                    }
                    await UpdateNotesData(text, newChapters);
                    await _projectDataDoc.SubmitJson0OpAsync(op =>
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

                if (_project.TranslateEnabled && trainEngine)
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
                _conn?.Dispose();
            }
        }

        private async Task<bool> InitAsync(string projectId, string userId)
        {
            if (!(await _projects.TryGetAsync(projectId)).TryResult(out _project))
                return false;

            _conn = await _realtimeService.ConnectAsync();
            _projectDataDoc = _conn.Get<SFProjectData>(RootDataTypes.Projects, projectId);
            await _projectDataDoc.FetchAsync();
            if (!_projectDataDoc.IsLoaded)
                return false;

            if (!(await _userSecrets.TryGetAsync(userId)).TryResult(out _userSecret))
                return false;

            _notesMapper.Init(_userSecret, _project);

            await _projectDataDoc.SubmitJson0OpAsync(op => op.Set(pd => pd.Sync.PercentCompleted, 0));

            if (!_fileSystemService.DirectoryExists(WorkingDir))
                _fileSystemService.CreateDirectory(WorkingDir);
            return true;
        }

        private async Task<List<Chapter>> SyncOrCloneBookUsxAsync(TextInfo text, TextType textType, string paratextId,
            bool isReadOnly, ISet<int> chaptersToInclude = null)
        {
            string projectPath = GetProjectPath(textType);
            if (!_fileSystemService.DirectoryExists(projectPath))
                _fileSystemService.CreateDirectory(projectPath);

            string fileName = GetUsxFileName(projectPath, text.BookId);
            if (_fileSystemService.FileExists(fileName))
                return await SyncBookUsxAsync(text, textType, paratextId, fileName, isReadOnly, chaptersToInclude);
            else
                return await CloneBookUsxAsync(text, textType, paratextId, fileName, chaptersToInclude);
        }

        private async Task<List<Chapter>> SyncBookUsxAsync(TextInfo text, TextType textType, string paratextId,
            string fileName, bool isReadOnly, ISet<int> chaptersToInclude)
        {
            SortedList<int, IDocument<Delta>> textDocs = await FetchTextDocsAsync(text, textType);

            // Merge mongo data to PT cloud.
            XElement bookTextElem;
            string bookText;
            if (isReadOnly)
            {
                bookText = await _paratextService.GetBookTextAsync(_userSecret, paratextId, text.BookId);
            }
            else
            {
                bookTextElem = await LoadXmlFileAsync(fileName);

                XElement oldUsxElem = bookTextElem.Element("usx");
                if (oldUsxElem == null)
                    throw new InvalidOperationException("Invalid USX data, missing 'usx' element.");
                XElement bookElem = oldUsxElem.Element("book");
                if (bookElem == null)
                    throw new InvalidOperationException("Invalid USX data, missing 'book' element.");
                XElement newUsxElem = _deltaUsxMapper.ToUsx((string)oldUsxElem.Attribute("version"),
                    (string)bookElem.Attribute("code"), (string)bookElem, textDocs.Values.Select(d => d.Data));

                var revision = (string)bookTextElem.Attribute("revision");

                if (XNode.DeepEquals(oldUsxElem, newUsxElem))
                {
                    bookText = await _paratextService.GetBookTextAsync(_userSecret, paratextId, text.BookId);
                }
                else
                {
                    bookText = await _paratextService.UpdateBookTextAsync(_userSecret, paratextId, text.BookId,
                        revision, newUsxElem.ToString());
                }
            }
            await UpdateProgress();

            bookTextElem = XElement.Parse(bookText);

            // Merge updated PT cloud data into mongo.
            var tasks = new List<Task>();
            IReadOnlyDictionary<int, (Delta Delta, int LastVerse)> deltas = _deltaUsxMapper.ToChapterDeltas(
                bookTextElem.Element("usx"));
            var chapters = new List<Chapter>();
            foreach (KeyValuePair<int, (Delta Delta, int LastVerse)> kvp in deltas)
            {
                if (textDocs.TryGetValue(kvp.Key, out IDocument<Delta> textDataDoc))
                {
                    Delta diffDelta = textDataDoc.Data.Diff(kvp.Value.Delta);
                    tasks.Add(textDataDoc.SubmitOpAsync(diffDelta));
                    textDocs.Remove(kvp.Key);
                }
                else if (chaptersToInclude == null || chaptersToInclude.Contains(kvp.Key))
                {
                    textDataDoc = GetTextDoc(text, kvp.Key, textType);
                    tasks.Add(textDataDoc.CreateAsync(kvp.Value.Delta));
                }
                chapters.Add(new Chapter { Number = kvp.Key, LastVerse = kvp.Value.LastVerse });
            }
            foreach (KeyValuePair<int, IDocument<Delta>> kvp in textDocs)
                tasks.Add(kvp.Value.DeleteAsync());
            await Task.WhenAll(tasks);

            // Save to disk
            await SaveXmlFileAsync(bookTextElem, fileName);

            await UpdateProgress();
            return chapters;
        }

        /// <summary>
        /// Fetches all text docs from the database for a book.
        /// </summary>
        private async Task<SortedList<int, IDocument<Delta>>> FetchTextDocsAsync(TextInfo text, TextType textType)
        {
            var textDocs = new SortedList<int, IDocument<Delta>>();
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
            {
                IDocument<Delta> textDoc = GetTextDoc(text, chapter.Number, textType);
                textDocs[chapter.Number] = textDoc;
                tasks.Add(textDoc.FetchAsync());
            }
            await Task.WhenAll(tasks);
            return textDocs;
        }

        private async Task<List<Chapter>> CloneBookUsxAsync(TextInfo text, TextType textType, string paratextId,
            string fileName, ISet<int> chaptersToInclude)
        {
            // Remove any stale text_data records that may be in the way.
            await DeleteAllTextDocsForBookAsync(text, textType);

            string bookText = await _paratextService.GetBookTextAsync(_userSecret, paratextId, text.BookId);
            var bookTextElem = XElement.Parse(bookText);

            await SaveXmlFileAsync(bookTextElem, fileName);
            await UpdateProgress();

            IReadOnlyDictionary<int, (Delta Delta, int LastVerse)> deltas = _deltaUsxMapper.ToChapterDeltas(
                bookTextElem.Element("usx"));
            var tasks = new List<Task>();
            var chapters = new List<Chapter>();
            foreach (KeyValuePair<int, (Delta Delta, int LastVerse)> kvp in deltas)
            {
                if (chaptersToInclude != null && !chaptersToInclude.Contains(kvp.Key))
                    continue;

                IDocument<Delta> textDataDoc = GetTextDoc(text, kvp.Key, textType);
                tasks.Add(textDataDoc.CreateAsync(kvp.Value.Delta));
                chapters.Add(new Chapter { Number = kvp.Key, LastVerse = kvp.Value.LastVerse });
            }
            await Task.WhenAll(tasks);
            await UpdateProgress();
            return chapters;
        }

        /// <summary>
        /// Deletes the cached USX file from the disk and all text docs from the database for a book.
        /// </summary>
        private async Task DeleteAllTextDataForBookAsync(TextInfo text, TextType textType)
        {
            string projectPath = GetProjectPath(textType);
            _fileSystemService.DeleteFile(GetUsxFileName(projectPath, text.BookId));
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
            SortedList<int, IDocument<List<Question>>> questionsDocs = await FetchQuestionsDocsAsync(text);
            SortedList<int, IDocument<List<Comment>>> commentsDocs = await FetchCommentsDocsAsync(text);

            if (_project.CheckingEnabled)
            {
                XElement oldNotesElem;
                string oldNotesText = await _paratextService.GetNotesAsync(_userSecret, _project.ParatextId,
                    text.BookId);
                if (oldNotesText != "")
                    oldNotesElem = XElement.Parse(oldNotesText);
                else
                    oldNotesElem = new XElement("notes", new XAttribute("version", "1.1"));

                XElement notesElem = await _notesMapper.GetNotesChangelistAsync(oldNotesElem, questionsDocs.Values,
                    commentsDocs.Values);

                if (notesElem.Elements("thread").Any())
                    await _paratextService.UpdateNotesAsync(_userSecret, _project.ParatextId, notesElem.ToString());

                await UpdateProgress();
            }

            // handle addition/deletion of chapters
            var tasks = new List<Task>();
            foreach (Chapter newChapter in newChapters)
            {
                if (questionsDocs.ContainsKey(newChapter.Number))
                    questionsDocs.Remove(newChapter.Number);
                else
                    tasks.Add(CreateQuestionsDocAsync(text, newChapter.Number));

                if (commentsDocs.ContainsKey(newChapter.Number))
                    commentsDocs.Remove(newChapter.Number);
                else
                    tasks.Add(CreateCommentsDocAsync(text, newChapter.Number));

            }
            foreach (IDocument<List<Question>> questionsDoc in questionsDocs.Values)
                tasks.Add(questionsDoc.DeleteAsync());
            foreach (IDocument<List<Comment>> commentsDoc in commentsDocs.Values)
                tasks.Add(commentsDoc.DeleteAsync());
            await Task.WhenAll(tasks);
        }

        private async Task<SortedList<int, IDocument<List<Question>>>> FetchQuestionsDocsAsync(TextInfo text)
        {
            var questionsDocs = new SortedList<int, IDocument<List<Question>>>();
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
            {
                IDocument<List<Question>> questionsDoc = GetQuestionsDoc(text, chapter.Number);
                questionsDocs[chapter.Number] = questionsDoc;
                tasks.Add(questionsDoc.FetchAsync());
            }
            await Task.WhenAll(tasks);
            return questionsDocs;
        }

        private async Task<SortedList<int, IDocument<List<Comment>>>> FetchCommentsDocsAsync(TextInfo text)
        {
            var commentsDocs = new SortedList<int, IDocument<List<Comment>>>();
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
            {
                IDocument<List<Comment>> commentsDoc = GetCommentsDoc(text, chapter.Number);
                commentsDocs[chapter.Number] = commentsDoc;
                tasks.Add(commentsDoc.FetchAsync());
            }
            await Task.WhenAll(tasks);
            return commentsDocs;
        }

        /// <summary>
        /// Deletes all real-time questions and comments docs from the database for a book.
        /// </summary>
        private async Task DeleteAllNotesDocsForBookAsync(TextInfo text)
        {
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
            {
                tasks.Add(DeleteQuestionsDocAsync(text, chapter.Number));
                tasks.Add(DeleteCommentsDocAsync(text, chapter.Number));
            }
            await Task.WhenAll(tasks);
        }

        /// <summary>
        /// Gets all books that need to be deleted.
        /// </summary>
        private IEnumerable<string> GetBooksToDelete(TextType textType, IEnumerable<string> existingBooks)
        {
            string projectPath = GetProjectPath(textType);
            var booksToDelete = new HashSet<string>(_fileSystemService.DirectoryExists(projectPath)
                ? _fileSystemService.EnumerateFiles(projectPath).Select(Path.GetFileNameWithoutExtension)
                : Enumerable.Empty<string>());
            booksToDelete.ExceptWith(existingBooks);
            return booksToDelete;
        }

        private async Task CompleteSync(bool successful)
        {
            if (_project == null || _projectDataDoc == null)
                return;

            await _projectDataDoc.SubmitJson0OpAsync(op =>
                {
                    op.Inc(pd => pd.Sync.QueuedCount, -1);
                    op.Unset(pd => pd.Sync.PercentCompleted);
                    op.Set(pd => pd.Sync.LastSyncSuccessful, successful);
                    if (successful)
                        op.Set(pd => pd.Sync.DateLastSuccessfulSync, DateTime.UtcNow);
                });
            if (_notesMapper.NewSyncUsers.Count > 0)
            {
                await _projects.UpdateAsync(_project.Id, u =>
                    {
                        foreach (SyncUser syncUser in _notesMapper.NewSyncUsers)
                            u.Add(p => p.SyncUsers, syncUser);
                    });
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
            return Path.Combine(WorkingDir, _project.Id, textTypeDir);
        }

        private static string GetUsxFileName(string projectPath, string bookId)
        {
            return Path.Combine(projectPath, bookId + ".xml");
        }

        private async Task<XElement> LoadXmlFileAsync(string fileName)
        {
            using (Stream stream = _fileSystemService.OpenFile(fileName, FileMode.Open))
            {
                return await XElement.LoadAsync(stream, LoadOptions.None, CancellationToken.None);
            }
        }

        private async Task SaveXmlFileAsync(XElement bookTextElem, string fileName)
        {
            using (Stream stream = _fileSystemService.CreateFile(fileName))
            {
                await bookTextElem.SaveAsync(stream, SaveOptions.None, CancellationToken.None);
            }
        }

        private IDocument<Delta> GetTextDoc(TextInfo text, int chapter, TextType textType)
        {
            return _conn.Get<Delta>(SFRootDataTypes.Texts,
                TextInfo.GetTextDocId(_project.Id, text.BookId, chapter, textType));
        }

        private IDocument<List<Question>> GetQuestionsDoc(TextInfo text, int chapter)
        {
            return _conn.Get<List<Question>>(SFRootDataTypes.Questions,
                TextInfo.GetTextDocId(_project.Id, text.BookId, chapter));
        }

        private IDocument<List<Comment>> GetCommentsDoc(TextInfo text, int chapter)
        {
            return _conn.Get<List<Comment>>(SFRootDataTypes.Comments,
                TextInfo.GetTextDocId(_project.Id, text.BookId, chapter));
        }

        private async Task CreateQuestionsDocAsync(TextInfo text, int chapter)
        {
            IDocument<List<Question>> questionsDoc = GetQuestionsDoc(text, chapter);
            await questionsDoc.FetchAsync();
            if (!questionsDoc.IsLoaded)
                await questionsDoc.CreateAsync(new List<Question>());
        }

        private async Task CreateCommentsDocAsync(TextInfo text, int chapter)
        {
            IDocument<List<Comment>> commentsDoc = GetCommentsDoc(text, chapter);
            await commentsDoc.FetchAsync();
            if (!commentsDoc.IsLoaded)
                await commentsDoc.CreateAsync(new List<Comment>());
        }

        private async Task DeleteTextDocAsync(TextInfo text, int chapter, TextType textType)
        {
            IDocument<Delta> textDoc = GetTextDoc(text, chapter, textType);
            await textDoc.FetchAsync();
            if (textDoc.IsLoaded)
                await textDoc.DeleteAsync();
        }

        private async Task DeleteQuestionsDocAsync(TextInfo text, int chapter)
        {
            IDocument<List<Question>> questionsDoc = GetQuestionsDoc(text, chapter);
            await questionsDoc.FetchAsync();
            if (questionsDoc.IsLoaded)
                await questionsDoc.DeleteAsync();
        }

        private async Task DeleteCommentsDocAsync(TextInfo text, int chapter)
        {
            IDocument<List<Comment>> commentsDoc = GetCommentsDoc(text, chapter);
            await commentsDoc.FetchAsync();
            if (commentsDoc.IsLoaded)
                await commentsDoc.DeleteAsync();
        }

        private async Task UpdateProgress()
        {
            if (_projectDataDoc == null)
                return;
            _step++;
            double percentCompleted = Math.Round((double)_step / _stepCount, 2, MidpointRounding.AwayFromZero);
            await _projectDataDoc.SubmitJson0OpAsync(op => op.Set(pd => pd.Sync.PercentCompleted, percentCompleted));
        }

        private class ChapterEqualityComparer : IEqualityComparer<Chapter>
        {
            public bool Equals(Chapter x, Chapter y)
            {
                return x.Number == y.Number && x.LastVerse == y.LastVerse;
            }

            public int GetHashCode(Chapter obj)
            {
                int code = 23;
                code = code * 31 + obj.Number.GetHashCode();
                code = code * 31 + obj.LastVerse.GetHashCode();
                return code;
            }
        }
    }
}
