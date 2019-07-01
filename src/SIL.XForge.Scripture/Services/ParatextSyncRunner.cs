using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Hangfire;
using Hangfire.Server;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SIL.Machine.WebApi.Services;
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
    /// <summary>Merges data between database and PT cloud, updating both and saving
    /// the result to disk. This code will be invoked in the background on the
    /// server. The user can trigger this by activities such as the sync,
    /// connect-project, or settings components.</summary>
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

        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IRepository<UserEntity> _users;
        private readonly IRepository<SyncJobEntity> _jobs;
        private readonly IRepository<SFProjectEntity> _projects;
        private readonly IEngineService _engineService;
        private readonly IParatextService _paratextService;
        private readonly IRealtimeService _realtimeService;
        private readonly DeltaUsxMapper _deltaUsxMapper;
        private readonly IFileSystemService _fileSystemService;
        private readonly ILogger<ParatextSyncRunner> _logger;

        internal SyncJobEntity _job;
        private int _stepCount;
        private int _step;

        public ParatextSyncRunner(IOptions<SiteOptions> siteOptions, IRepository<UserEntity> users,
            IRepository<SyncJobEntity> jobs, IRepository<SFProjectEntity> projects, IEngineService engineService,
            IParatextService paratextService, IRealtimeService realtimeService, IFileSystemService fileSystemService,
            ILogger<ParatextSyncRunner> logger)
        {
            _siteOptions = siteOptions;
            _users = users;
            _jobs = jobs;
            _projects = projects;
            _engineService = engineService;
            _paratextService = paratextService;
            _realtimeService = realtimeService;
            _fileSystemService = fileSystemService;
            _logger = logger;
            _deltaUsxMapper = new DeltaUsxMapper();
        }

        private string WorkingDir => Path.Combine(_siteOptions.Value.SiteDir, "sync");

        // Do not allow multiple sync jobs to run in parallel on the same project by creating a mutex on the projectId
        // parameter, i.e. "{3}"
        [Mutex("{3}")]
        public async Task RunAsync(PerformContext context, IJobCancellationToken cancellationToken, string userId,
            string projectId, string jobId, bool trainEngine)
        {
            _job = await _jobs.UpdateAsync(j => j.Id == jobId, u => u
                .Set(j => j.BackgroundJobId, context.BackgroundJob.Id)
                .Set(j => j.State, SyncJobEntity.SyncingState));
            if (_job == null)
                return;

            SFProjectEntity project = await _projects.UpdateAsync(_job.ProjectRef,
                u => u.Set(p => p.ActiveSyncJobRef, _job.Id));
            try
            {
                if (project != null && (await _users.TryGetAsync(userId)).TryResult(out UserEntity user))
                {
                    if (!_fileSystemService.DirectoryExists(WorkingDir))
                        _fileSystemService.CreateDirectory(WorkingDir);

                    using (IConnection conn = await _realtimeService.ConnectAsync())
                    {
                        IDocument<SFProjectData> projectDataDoc = conn.Get<SFProjectData>(RootDataTypes.Projects,
                            project.Id);
                        await projectDataDoc.FetchAsync();

                        string targetParatextId = project.ParatextId;
                        var targetBooks = new HashSet<string>(await _paratextService.GetBooksAsync(user,
                            targetParatextId));

                        string sourceParatextId = project.SourceParatextId;
                        var sourceBooks = new HashSet<string>(project.TranslateEnabled
                            ? await _paratextService.GetBooksAsync(user, sourceParatextId)
                            : Enumerable.Empty<string>());

                        var booksToSync = new HashSet<string>(targetBooks);
                        if (!project.CheckingEnabled)
                            booksToSync.IntersectWith(sourceBooks);

                        var targetBooksToDelete = new HashSet<string>(GetBooksToDelete(project, TextType.Target,
                            booksToSync));
                        var sourceBooksToDelete = new HashSet<string>(project.TranslateEnabled
                            ? GetBooksToDelete(project, TextType.Source, booksToSync)
                            : Enumerable.Empty<string>());

                        _step = 0;
                        _stepCount = (booksToSync.Count * 2) + (sourceBooks.Intersect(booksToSync).Count() * 2);
                        if (targetBooksToDelete.Count > 0 || sourceBooksToDelete.Count > 0)
                        {
                            _stepCount += 1;

                            // delete source books
                            foreach (string bookId in sourceBooksToDelete)
                            {
                                TextInfo text = projectDataDoc.Data.Texts.First(t => t.BookId == bookId);
                                await DeleteBookUsxAsync(conn, project, text, TextType.Source);
                            }
                            // delete target books
                            foreach (string bookId in targetBooksToDelete)
                            {
                                int textIndex = projectDataDoc.Data.Texts.FindIndex(t => t.BookId == bookId);
                                TextInfo text = projectDataDoc.Data.Texts[textIndex];
                                List<Json0Op> op = Json0Op.New().ListDelete(
                                    new object[] { nameof(SFProjectData.Texts), textIndex }, text);
                                await projectDataDoc.SubmitOpAsync(op);

                                await DeleteBookUsxAsync(conn, project, text, TextType.Target);
                                await DeleteNotesData(conn, project, text);
                            }
                            await UpdateProgress();
                        }

                        // sync source and target books
                        foreach (string bookId in booksToSync)
                        {
                            if (!BookNames.TryGetValue(bookId, out string name))
                                name = bookId;

                            bool hasSource = sourceBooks.Contains(bookId);
                            int textIndex = projectDataDoc.Data.Texts.FindIndex(t => t.BookId == bookId);
                            TextInfo text;
                            if (textIndex == -1)
                                text = new TextInfo { BookId = bookId, Name = name, HasSource = hasSource };
                            else
                                text = projectDataDoc.Data.Texts[textIndex];

                            List<Chapter> newChapters = await SyncOrCloneBookUsxAsync(user, conn, project, text,
                                TextType.Target, targetParatextId, false);
                            if (hasSource)
                            {
                                var chaptersToInclude = new HashSet<int>(newChapters.Select(c => c.Number));
                                await SyncOrCloneBookUsxAsync(user, conn, project, text, TextType.Source,
                                    sourceParatextId, true, chaptersToInclude);
                            }
                            await UpdateNotesData(conn, project, text, newChapters);
                            List<Json0Op> op = Json0Op.New();
                            if (textIndex == -1)
                            {
                                // insert text info for new text
                                text.Chapters = newChapters;
                                op.ListInsert(new object[]
                                    { nameof(SFProjectData.Texts), projectDataDoc.Data.Texts.Count },
                                    text);
                            }
                            else
                            {
                                // update text info
                                op
                                    .ObjectReplace(new object[]
                                        { nameof(SFProjectData.Texts), textIndex, nameof(TextInfo.Chapters) },
                                        text.Chapters, newChapters)
                                    .ObjectReplace(new object[]
                                        { nameof(SFProjectData.Texts), textIndex, nameof(TextInfo.HasSource) },
                                        text.HasSource, hasSource);
                            }
                            await projectDataDoc.SubmitOpAsync(op);
                        }
                    }

                    // TODO: Properly handle job cancellation
                    cancellationToken.ThrowIfCancellationRequested();

                    if (project.TranslateEnabled && trainEngine)
                    {
                        // start training Machine engine
                        await _engineService.StartBuildByProjectIdAsync(_job.ProjectRef);
                    }

                    await _projects.UpdateAsync(_job.ProjectRef, u => u
                        .Set(p => p.LastSyncedDate, DateTime.UtcNow)
                        .Unset(p => p.ActiveSyncJobRef));
                }
                else
                {
                    await _projects.UpdateAsync(_job.ProjectRef, u => u.Unset(p => p.ActiveSyncJobRef));
                }
                _job = await _jobs.UpdateAsync(_job, u => u
                    .Set(j => j.State, SyncJobEntity.IdleState)
                    .Unset(j => j.BackgroundJobId));
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("The Paratext sync job '{Job}' was cancelled.", _job.Id);
                await _projects.UpdateAsync(_job.ProjectRef, u => u.Unset(p => p.ActiveSyncJobRef));
                _job = await _jobs.UpdateAsync(_job, u => u
                    .Set(j => j.State, SyncJobEntity.CanceledState)
                    .Unset(j => j.BackgroundJobId));
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Error occurred while executing Paratext sync job '{Job}'", _job.Id);
                await _projects.UpdateAsync(_job.ProjectRef, u => u.Unset(p => p.ActiveSyncJobRef));
                await _jobs.UpdateAsync(_job, u => u
                    .Set(j => j.State, SyncJobEntity.ErrorState)
                    .Unset(j => j.BackgroundJobId));
            }
        }

        internal async Task<List<Chapter>> SyncOrCloneBookUsxAsync(UserEntity user, IConnection conn,
             SFProjectEntity project, TextInfo text, TextType textType, string paratextId, bool isReadOnly,
             ISet<int> chaptersToInclude = null)
        {
            string projectPath = GetProjectPath(project, textType);
            if (!_fileSystemService.DirectoryExists(projectPath))
                _fileSystemService.CreateDirectory(projectPath);

            string fileName = GetUsxFileName(projectPath, text.BookId);
            if (_fileSystemService.FileExists(fileName))
            {
                return await SyncBookUsxAsync(user, conn, project, text, textType, paratextId, fileName, isReadOnly,
                    chaptersToInclude);
            }
            else
            {
                return await CloneBookUsxAsync(user, conn, project, text, textType, paratextId, fileName,
                    chaptersToInclude);
            }
        }

        private async Task<List<Chapter>> SyncBookUsxAsync(UserEntity user, IConnection conn, SFProjectEntity project,
            TextInfo text, TextType textType, string paratextId, string fileName, bool isReadOnly,
            ISet<int> chaptersToInclude)
        {
            SortedList<int, IDocument<Delta>> textDocs = await FetchTextDocsAsync(conn, project, text, textType);

            // Merge mongo data to PT cloud.
            XElement bookTextElem;
            string bookText;
            if (isReadOnly)
            {
                bookText = await _paratextService.GetBookTextAsync(user, paratextId, text.BookId);
            }
            else
            {
                bookTextElem = await LoadUsxFileAsync(fileName);

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
                    bookText = await _paratextService.GetBookTextAsync(user, paratextId, text.BookId);
                }
                else
                {
                    bookText = await _paratextService.UpdateBookTextAsync(user, paratextId, text.BookId, revision,
                        newUsxElem.ToString());
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
                    tasks.Add(textDataDoc.CreateAsync(kvp.Value.Delta));
                }
                chapters.Add(new Chapter { Number = kvp.Key, LastVerse = kvp.Value.LastVerse });
            }
            foreach (KeyValuePair<int, IDocument<Delta>> kvp in textDocs)
                tasks.Add(kvp.Value.DeleteAsync());
            await Task.WhenAll(tasks);

            // Save to disk
            await SaveUsxFileAsync(bookTextElem, fileName);

            await UpdateProgress();
            return chapters;
        }

        /// <summary>Fetch from backend database</summary>
        internal async Task<SortedList<int, IDocument<Delta>>> FetchTextDocsAsync(IConnection conn,
            SFProjectEntity project, TextInfo text, TextType textType)
        {
            var textDocs = new SortedList<int, IDocument<Delta>>();
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
            {
                IDocument<Delta> textDoc = GetTextDoc(conn, project, text, chapter.Number, textType);
                textDocs[chapter.Number] = textDoc;
                tasks.Add(textDoc.FetchAsync());
            }
            await Task.WhenAll(tasks);
            return textDocs;
        }

        private async Task<List<Chapter>> CloneBookUsxAsync(UserEntity user, IConnection conn, SFProjectEntity project,
            TextInfo text, TextType textType, string paratextId, string fileName, ISet<int> chaptersToInclude)
        {
            // Remove any stale text_data records that may be in the way.
            await DeleteAllTextDataForBookAsync(conn, project, text, textType);

            var bookTextElem = await FetchAndSaveBookUsxAsync(user, text, paratextId, fileName);
            await UpdateProgress();

            IReadOnlyDictionary<int, (Delta Delta, int LastVerse)> deltas = _deltaUsxMapper.ToChapterDeltas(
                bookTextElem.Element("usx"));
            var tasks = new List<Task>();
            var chapters = new List<Chapter>();
            foreach (KeyValuePair<int, (Delta Delta, int LastVerse)> kvp in deltas)
            {
                if (chaptersToInclude != null && !chaptersToInclude.Contains(kvp.Key))
                    continue;

                IDocument<Delta> textDataDoc = GetTextDoc(conn, project, text, kvp.Key, textType);
                tasks.Add(textDataDoc.CreateAsync(kvp.Value.Delta));
                chapters.Add(new Chapter { Number = kvp.Key, LastVerse = kvp.Value.LastVerse });
            }
            await Task.WhenAll(tasks);
            await UpdateProgress();
            return chapters;
        }


        internal async Task<XElement> FetchAndSaveBookUsxAsync(UserEntity user, TextInfo text, string paratextId,
            string fileName)
        {
            string bookText = await _paratextService.GetBookTextAsync(user, paratextId, text.BookId);
            var bookTextElem = XElement.Parse(bookText);

            await SaveUsxFileAsync(bookTextElem, fileName);
            return bookTextElem;

        }

        /// <summary>From filesystem and backend database</summary>
        private async Task DeleteBookUsxAsync(IConnection conn, SFProjectEntity project, TextInfo text,
            TextType textType)
        {
            string projectPath = GetProjectPath(project, textType);
            _fileSystemService.DeleteFile(GetUsxFileName(projectPath, text.BookId));
            await DeleteAllTextDataForBookAsync(conn, project, text, textType);
        }

        /// <summary>From backend database</summary>
        private async Task DeleteAllTextDataForBookAsync(IConnection conn, SFProjectEntity project, TextInfo text,
            TextType textType)
        {
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
                tasks.Add(DeleteTextDocAsync(conn, project, text, chapter.Number, textType));
            await Task.WhenAll(tasks);
        }

        private async Task UpdateNotesData(IConnection conn, SFProjectEntity project, TextInfo text,
            List<Chapter> newChapters)
        {
            var oldChapters = new HashSet<int>(text.Chapters.Select(c => c.Number));
            var tasks = new List<Task>();
            foreach (Chapter newChapter in newChapters)
            {
                if (oldChapters.Contains(newChapter.Number))
                {
                    oldChapters.Remove(newChapter.Number);
                }
                else
                {
                    tasks.Add(CreateQuestionsDocAsync(conn, project, text, newChapter.Number));
                    tasks.Add(CreateCommentsDocAsync(conn, project, text, newChapter.Number));
                }
            }
            foreach (int oldChapter in oldChapters)
            {
                tasks.Add(DeleteQuestionsDocAsync(conn, project, text, oldChapter));
                tasks.Add(DeleteCommentsDocAsync(conn, project, text, oldChapter));
            }
            await Task.WhenAll(tasks);
        }

        private async Task DeleteNotesData(IConnection conn, SFProjectEntity project, TextInfo text)
        {
            var tasks = new List<Task>();
            foreach (Chapter chapter in text.Chapters)
            {
                tasks.Add(DeleteQuestionsDocAsync(conn, project, text, chapter.Number));
                tasks.Add(DeleteCommentsDocAsync(conn, project, text, chapter.Number));
            }
            await Task.WhenAll(tasks);
        }

        private string GetProjectPath(SFProjectEntity project, TextType textType)
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
            return Path.Combine(WorkingDir, project.Id, textTypeDir);
        }

        private string GetUsxFileName(string projectPath, string bookId)
        {
            return Path.Combine(projectPath, bookId + ".xml");
        }

        private async Task<XElement> LoadUsxFileAsync(string fileName)
        {
            using (Stream stream = _fileSystemService.OpenFile(fileName, FileMode.Open))
            {
                return await XElement.LoadAsync(stream, LoadOptions.None, CancellationToken.None);
            }
        }

        private async Task SaveUsxFileAsync(XElement bookTextElem, string fileName)
        {
            using (Stream stream = _fileSystemService.CreateFile(fileName))
            {
                await bookTextElem.SaveAsync(stream, SaveOptions.None, CancellationToken.None);
            }
        }

        private IDocument<Delta> GetTextDoc(IConnection conn, SFProjectEntity project, TextInfo text,
            int chapter, TextType textType)
        {
            return conn.Get<Delta>(SFRootDataTypes.Texts,
                TextInfo.GetTextDocId(project.Id, text.BookId, chapter, textType));
        }

        private IDocument<List<Question>> GetQuestionsDoc(IConnection conn, SFProjectEntity project,
            TextInfo text, int chapter)
        {
            return conn.Get<List<Question>>(SFRootDataTypes.Questions,
                TextInfo.GetTextDocId(project.Id, text.BookId, chapter));
        }

        private IDocument<List<Comment>> GetCommentsDoc(IConnection conn, SFProjectEntity project,
            TextInfo text, int chapter)
        {
            return conn.Get<List<Comment>>(SFRootDataTypes.Comments,
                TextInfo.GetTextDocId(project.Id, text.BookId, chapter));
        }

        private IEnumerable<string> GetBooksToDelete(SFProjectEntity project, TextType textType,
        IEnumerable<string> books)
        {
            string projectPath = GetProjectPath(project, textType);
            var booksToDelete = new HashSet<string>(_fileSystemService.DirectoryExists(projectPath)
                ? _fileSystemService.EnumerateFiles(projectPath).Select(Path.GetFileNameWithoutExtension)
                : Enumerable.Empty<string>());
            booksToDelete.ExceptWith(books);
            return booksToDelete;
        }

        private async Task CreateQuestionsDocAsync(IConnection conn, SFProjectEntity project, TextInfo text,
            int chapter)
        {
            IDocument<List<Question>> questionsDoc = GetQuestionsDoc(conn, project, text, chapter);
            await questionsDoc.FetchAsync();
            if (!questionsDoc.IsLoaded)
                await questionsDoc.CreateAsync(new List<Question>());
        }

        private async Task CreateCommentsDocAsync(IConnection conn, SFProjectEntity project, TextInfo text, int chapter)
        {
            IDocument<List<Comment>> commentsDoc = GetCommentsDoc(conn, project, text, chapter);
            await commentsDoc.FetchAsync();
            if (!commentsDoc.IsLoaded)
                await commentsDoc.CreateAsync(new List<Comment>());
        }

        private async Task DeleteTextDocAsync(IConnection conn, SFProjectEntity project, TextInfo text, int chapter,
            TextType textType)
        {
            IDocument<Delta> textDoc = GetTextDoc(conn, project, text, chapter, textType);
            await textDoc.FetchAsync();
            if (textDoc.IsLoaded)
                await textDoc.DeleteAsync();
        }

        private async Task DeleteQuestionsDocAsync(IConnection conn, SFProjectEntity project, TextInfo text,
            int chapter)
        {
            IDocument<List<Question>> questionsDoc = GetQuestionsDoc(conn, project, text, chapter);
            await questionsDoc.FetchAsync();
            if (questionsDoc.IsLoaded)
                await questionsDoc.DeleteAsync();
        }

        private async Task DeleteCommentsDocAsync(IConnection conn, SFProjectEntity project, TextInfo text, int chapter)
        {
            IDocument<List<Comment>> commentsDoc = GetCommentsDoc(conn, project, text, chapter);
            await commentsDoc.FetchAsync();
            if (commentsDoc.IsLoaded)
                await commentsDoc.DeleteAsync();
        }

        private async Task UpdateProgress()
        {
            _step++;
            double percentCompleted = (double)_step / _stepCount;
            _job = await _jobs.UpdateAsync(_job, u => u
                .Set(j => j.PercentCompleted, percentCompleted));
        }
    }
}
