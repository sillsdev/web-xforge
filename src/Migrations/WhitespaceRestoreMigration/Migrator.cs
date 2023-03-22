using SIL.ObjectModel;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using Microsoft.Extensions.Configuration;
using System.Xml.Linq;
using Autofac;
using SIL.XForge.Models;
using System.Text.RegularExpressions;
using System.Data;
using SIL.XForge.Realtime.RichText;

namespace WhitespaceRestoreMigration;

enum DirtyStatus
{
    CLEAN,
    DIRTY,
    MATCHES_NEW
}

/// <summary>
/// See <see cref="Program"/>.
/// </summary>
public class Migrator : DisposableBase
{
    private readonly IRealtimeService _realtimeService;
    private readonly IParatextService _paratextService;
    private readonly IRepository<UserSecret> _userSecretRepo;
    private readonly IDeltaUsxMapper _deltaUsxMapper;
    private readonly DataTable _problemStats;
    private readonly DataTable _projectStats;

    public Migrator(
        IRealtimeService realtimeService,
        IParatextService paratextService,
        IRepository<UserSecret> userSecretRepo,
        IDeltaUsxMapper deltaUsxMapper
    )
    {
        _realtimeService = realtimeService;
        _paratextService = paratextService;
        _userSecretRepo = userSecretRepo;
        _deltaUsxMapper = deltaUsxMapper;

        // Prepare some data tables to collect information on the migration run.

        _problemStats = new DataTable();
        _problemStats.Columns.Add("SFProjectId", typeof(string));
        _problemStats.Columns.Add("Book", typeof(int));
        _problemStats.Columns.Add("Chapter", typeof(int));
        _problemStats.Columns.Add("DirtyStatus", typeof(DirtyStatus));

        _projectStats = new DataTable();
        _projectStats.Columns.Add("SFProjectId", typeof(string));
        _projectStats.PrimaryKey = new DataColumn[] { _projectStats.Columns["SFProjectId"]! };
        _projectStats.Columns.Add("IsResource", typeof(bool));
        _projectStats.Columns.Add("NoAdequateUser", typeof(bool));
        _projectStats.Columns.Add("NullSyncedToRepositoryVersion", typeof(bool));
        _projectStats.Columns.Add("HasMalformedText", typeof(bool));
    }

    public async Task<bool> MigrateAsync(
        bool writeMode,
        ICollection<string> sfProjectIdsToMigrate,
        IDictionary<string, string> sfUsersToUse,
        CancellationToken cancellationToken
    )
    {
        bool allSuccess = true;

        List<SFProject> projects = await _realtimeService.QuerySnapshots<SFProject>().ToListAsync();

        // If we are only to migrate some projects, restrict this list to them
        if (sfProjectIdsToMigrate.Any())
        {
            projects.RemoveAll(p => !sfProjectIdsToMigrate.Contains(p.Id));
            string ids = string.Join(" ", projects.Select(p => p.Id));
            int count = projects.Count;
            Program.Log($"Only working on the subset of {count} projects with these SF project ids: {ids}");
        }

        IConnection conn = await _realtimeService.ConnectAsync();
        try
        {
            conn.BeginTransaction();
            foreach (SFProject project in projects)
            {
                _projectStats.Rows.Add(project.Id);
                if (_paratextService.IsResource(project.ParatextId))
                {
                    Program.Log($"sf proj {project.Id}: Skipping resource.");
                    _projectStats.Rows.Find(project.Id)!["IsResource"] = true;
                    continue;
                }

                Program.Log($"sf proj {project.Id}: Migrating project {project.Name}");

                IEnumerable<string> projectPtAdminUserIds = project.UserRoles
                    .Where(ur => ur.Value == SFProjectRole.Administrator)
                    .Select(ur => ur.Key);
                // We'll aim to use an admin user, but any pt_foo role will do to read from the PT hg repo.
                IEnumerable<string> projectPtRoleUsers = projectPtAdminUserIds.Concat(
                    project.UserRoles.Where(role => SFProjectRole.IsParatextRole(role.Value)).Select(role => role.Key)
                );
                if (!projectPtRoleUsers.Any())
                {
                    List<string> projectSfUserIds = project.UserRoles.Select(ur => ur.Key).ToList();
                    string users = projectSfUserIds.Any() ? string.Join(", ", projectSfUserIds) : "None";
                    Program.Log(
                        $"sf proj {project.Id}: Error: No users on project had an adequate role. Skipping project. Users include: {users}"
                    );
                    _projectStats.Rows.Find(project.Id)!["NoAdequateUser"] = true;
                    allSuccess = false;
                    continue;
                }

                string sfUserId = "";
                // Use specific users if requested.
                bool wasRequested = false;
                if (sfUsersToUse.ContainsKey(project.Id))
                {
                    sfUserId = sfUsersToUse[project.Id];
                    wasRequested = true;
                }
                else
                {
                    sfUserId = projectPtRoleUsers.First();
                }

                Program.Log(
                    $"sf proj {project.Id}: For SF project, using{(wasRequested ? " requested" : "")} SF user id {sfUserId}."
                );
                await ProcessProjectAsync(writeMode, project, sfUserId, conn, cancellationToken);
            }
            await conn.CommitTransactionAsync();
        }
        catch (Exception e)
        {
            Program.Log($"Error: Exception thrown: {e}");
            conn.RollbackTransaction();
            return false;
        }
        finally
        {
            conn?.Dispose();
        }

        ReportStats();
        return allSuccess;
    }

    /// <summary>
    /// Disposes managed resources.
    /// </summary>
    protected override void DisposeManagedResources() { }

    /// <returns>If successful</returns>
    private async Task ProcessProjectAsync(
        bool writeMode,
        SFProject project,
        string sfUserId,
        IConnection conn,
        CancellationToken cancellationToken
    )
    {
        UserSecret? userSecret = _userSecretRepo.Query().FirstOrDefault((UserSecret us) => us.Id == sfUserId);
        if (userSecret == null)
        {
            throw new Exception(
                $"When processing SF project id {project.Id}, could not find user secret for SF user id {sfUserId}."
            );
        }

        // Checkout PT repo at last-sync revision
        if (project.Sync.SyncedToRepositoryVersion == null)
        {
            Program.Log(
                $"sf proj {project.Id}: Warning. The SF DB SyncedToRepositoryVersion is null. Maybe this project is being Connected, or has not synced successfully since we started tracking this information. Will be using PT hg repo as it is."
            );
            _projectStats.Rows.Find(project.Id)!["NullSyncedToRepositoryVersion"] = true;
        }
        else
        {
            Program.Log(
                $"sf proj {project.Id}: Setting hg repo to last imported hg repo rev of {project.Sync.SyncedToRepositoryVersion}."
            );
            _paratextService.SetRepoToRevision(userSecret, project.ParatextId, project.Sync.SyncedToRepositoryVersion);
        }
        foreach (TextInfo bookInfo in project.Texts)
        {
            await ProcessBookAsync(writeMode, project, userSecret, bookInfo, conn);
        }
    }

    /// <returns>If successful</returns>
    private async Task ProcessBookAsync(
        bool writeMode,
        SFProject project,
        UserSecret userSecret,
        TextInfo bookInfo,
        IConnection conn
    )
    {
        string bookText = _paratextService.GetBookText(userSecret, project.ParatextId, bookInfo.BookNum);

        // Parser mechanism from before SF-1444 fix:
        XDocument oldParser = XDocument.Parse(bookText);

        // Parser mechanism from after SF-1444 fix:
        string bookUsx = Regex.Replace(bookText, @"^\s*", "", RegexOptions.CultureInvariant);
        bookUsx = Regex.Replace(bookUsx, @"\r?\n\s*", "", RegexOptions.CultureInvariant);
        XDocument newParser = XDocument.Parse(bookUsx, LoadOptions.PreserveWhitespace);

        // It might be that using the new parser mechanism will not yield a result that is any different than
        // the old. If so we don't need to migrate this book.
        bool oldAndNewAreSame = XNode.DeepEquals(oldParser, newParser);
        if (oldAndNewAreSame)
        {
            Program.Log(
                $"sf proj {project.Id}: book {bookInfo.BookNum}: Old and new parser outputs match. Not malformed."
            );
            return;
        }

        Program.Log(
            $"sf proj {project.Id}: book {bookInfo.BookNum}: Old and new parser outputs differ. Malformed text."
        );
        _projectStats.Rows.Find(project.Id)!["HasMalformedText"] = true;

        List<string> allProjectChapterTextDocIds = project.Texts
            .SelectMany(t => t.Chapters.Select(c => TextData.GetTextDocId(project.Id, t.BookNum, c.Number)))
            .ToList();
        IReadOnlyCollection<IDocument<TextData>> textDocsInSFDB = await conn.GetAndFetchDocsAsync<TextData>(
            allProjectChapterTextDocIds
        );
        SortedList<int, IDocument<TextData>> bookChapterTextDocsInSFDB = GetTextDocsForBook(
            project,
            bookInfo,
            textDocsInSFDB
        );
        foreach (Chapter chapter in bookInfo.Chapters)
        {
            await ProcessChapterAsync(
                writeMode,
                project,
                bookInfo,
                bookChapterTextDocsInSFDB,
                chapter,
                oldParser,
                newParser
            );
        }
    }

    private async Task ProcessChapterAsync(
        bool writeMode,
        SFProject project,
        TextInfo bookInfo,
        SortedList<int, IDocument<TextData>> bookChapterTextDocsInSFDB,
        Chapter chapter,
        XDocument oldParser,
        XDocument newParser
    )
    {
        IDocument<TextData> chapterTextDocInSFDB = bookChapterTextDocsInSFDB[chapter.Number];
        ChapterDelta chapterDeltaInSFDB =
            new(chapter.Number, chapter.LastVerse, chapter.IsValid, chapterTextDocInSFDB.Data);

        // The chapter text in SF DB came from USX originally, and would have been parsed by the older parsing
        // method. Has it been untouched since that time?
        bool sfChapterIsUnchangedFromOlderParserOutput = DoesUsxAlreadyIncorporateChapterDelta(
            oldParser,
            chapter.Number,
            chapterDeltaInSFDB,
            out _
        );

        // The chapter text in SF DB could already match how the new parsing method parses the USX. For example,
        // maybe the migrator was already run on the chapter. Is this so?
        bool sfChapterAlreadyMatchesNewParser = DoesUsxAlreadyIncorporateChapterDelta(
            newParser,
            chapter.Number,
            chapterDeltaInSFDB,
            out ChapterDelta chapterDeltaFromNewParseOfUsx
        );

        if (sfChapterAlreadyMatchesNewParser)
        {
            Program.Log(
                $"sf proj {project.Id}: book {bookInfo.BookNum}: chap {chapter.Number}: Text in SF DB already matches new parser. Skipping."
            );
            _problemStats.Rows.Add(project.Id, bookInfo.BookNum, chapter.Number, DirtyStatus.MATCHES_NEW);
            return;
        }
        else if (sfChapterIsUnchangedFromOlderParserOutput)
        {
            Program.Log(
                $"sf proj {project.Id}: book {bookInfo.BookNum}: chap {chapter.Number}: Text was not modified in SF since import from old parser. {(writeMode ? "Replacing in SF with newly parsed data." : "Not changing, since in read-only mode.")}"
            );
            _problemStats.Rows.Add(project.Id, bookInfo.BookNum, chapter.Number, DirtyStatus.CLEAN);
            if (writeMode)
            {
                Delta patch = chapterTextDocInSFDB.Data.Diff(chapterDeltaFromNewParseOfUsx.Delta);
                if (patch.Ops.Count > 0)
                    await chapterTextDocInSFDB.SubmitOpAsync(patch);
            }
            return;
        }
        else
        {
            // If the chapter text in SF DB has been modified from it's import by an older parsing of the USX,
            // leave it alone so we don't overwrite any user edits.
            Program.Log(
                $"sf proj {project.Id}: book {bookInfo.BookNum}: chap {chapter.Number}: Text was modified in SF since import from old parser. Skipping."
            );
            _problemStats.Rows.Add(project.Id, bookInfo.BookNum, chapter.Number, DirtyStatus.DIRTY);
            return;
        }
    }

    /// <summary>
    /// Determine if USX already matches a specific chapter delta's content. In other words, does
    /// chapter <paramref name="chapterNumber"/> in <paramref name="usx"/> already match
    /// <paramref name="someChapterDelta"/>? Returns the comparison result.
    /// Also, chapter <paramref name="chapterNumber"/> in <paramref name="usx"/> is returned as
    /// <paramref name="specifiedChapterDeltaFromUsx"/>.
    /// </summary>
    /// Implementation notes:
    /// ToUsx expects that the chapterdeltas passed to it will have a count that matches the usx chapters. So we can't
    /// just pass the single chapterdelta that we want to use. Instead, pass a chapterdelta set that has the data
    /// from the USX, except that a single chapterdelta will be replaced with the chapterdelta we wanted to use.
    private bool DoesUsxAlreadyIncorporateChapterDelta(
        XDocument usx,
        int chapterNumber,
        ChapterDelta someChapterDelta,
        out ChapterDelta specifiedChapterDeltaFromUsx
    )
    {
        // Get a set of chapter deltas that correspond to the usx input.
        Dictionary<int, ChapterDelta> chapterDeltas = _deltaUsxMapper
            .ToChapterDeltas(usx)
            .ToDictionary(cd => cd.Number);
        // Overwrite one of the chapters with a replacement. But return the original chapter delta that we are
        // overwriting.
        specifiedChapterDeltaFromUsx = chapterDeltas[chapterNumber];
        chapterDeltas[chapterNumber] = someChapterDelta;
        XDocument usxWithChapterModification = _deltaUsxMapper.ToUsx(usx, chapterDeltas.Values.ToArray());
        bool usxAlreadyIncorporatesSpecifiedChapterData = XNode.DeepEquals(usx, usxWithChapterModification);
        return usxAlreadyIncorporatesSpecifiedChapterData;
    }

    /// <summary>
    /// Gets the text docs from <see cref="docs"/> for the book specified in <see cref="text"/>.
    /// </summary>
    /// cf. ParatextSyncRunner.GetTextDocsForBook.
    private static SortedList<int, IDocument<TextData>> GetTextDocsForBook(
        SFProject project,
        TextInfo text,
        IReadOnlyCollection<IDocument<TextData>> docs
    )
    {
        var textDocs = new SortedList<int, IDocument<TextData>>(text.Chapters.Count);
        foreach (Chapter chapter in text.Chapters)
        {
            IDocument<TextData>? textDoc = docs.FirstOrDefault(
                d => d.Id == TextData.GetTextDocId(project.Id, text.BookNum, chapter.Number)
            );
            if (textDoc is not null)
            {
                textDocs[chapter.Number] = textDoc;
            }
        }

        return textDocs;
    }

    private void ReportStats()
    {
        Program.Log(
            $"Stats: Chapters with malformed text are as follows. Anything not listed was not found to be malformed."
        );
        var projectGroups = _problemStats
            .AsEnumerable()
            .GroupBy(
                row =>
                    new
                    {
                        SFProjectId = row.Field<string>("SFProjectId"),
                        DirtyStatus = row.Field<DirtyStatus>("DirtyStatus")
                    }
            )
            .OrderBy(group => group.Key.SFProjectId);

        foreach (var projectGroup in projectGroups)
        {
            string description = string.Empty;
            switch (projectGroup.Key.DirtyStatus)
            {
                case DirtyStatus.CLEAN:
                    description = "was not user-modified";
                    break;
                case DirtyStatus.DIRTY:
                    description = "was user-modified";
                    break;
                case DirtyStatus.MATCHES_NEW:
                    description = "already matches new parser";
                    break;
                default:
                    break;
            }

            Program.Log($"Stats: SFProjectId: {projectGroup.Key.SFProjectId}, Chap {description}.");

            var bookGroups = projectGroup.GroupBy(row => row.Field<int>("Book"));

            foreach (var bookGroup in bookGroups)
            {
                Program.Log($"Stats: - Book: {bookGroup.Key}");

                var chapterNumbers = bookGroup
                    .Select(row => row.Field<int>("Chapter"))
                    .OrderBy(chapterNumber => chapterNumber);

                Program.Log($"Stats: - Chapters: " + string.Join(", ", chapterNumbers));
            }
        }

        Program.Log($"Stats: Projects processed: {_projectStats.Rows.Count}");
        Program.Log($"Stats: Projects stopped at IsResource: {_projectStats.Select("IsResource = true").Length}");
        Program.Log(
            $"Stats: Projects stopped at NoAdequateUser: {_projectStats.Select("NoAdequateUser = true").Length}"
        );
        Program.Log(
            $"Stats: Projects with NullSyncedToRepositoryVersion: {_projectStats.Select("NullSyncedToRepositoryVersion = true").Length}"
        );
        Program.Log($"Stats: Projects with HasMalformedText: {_projectStats.Select("HasMalformedText = true").Length}");

        var chapterCounts = _problemStats
            .AsEnumerable()
            .GroupBy(row => row.Field<DirtyStatus>("DirtyStatus"))
            .ToDictionary(group => group.Key, group => group.Count());

        int cleanChaptersCount = chapterCounts.GetValueOrDefault(DirtyStatus.CLEAN);
        int dirtyChaptersCount = chapterCounts.GetValueOrDefault(DirtyStatus.DIRTY);
        int matchesNewChaptersCount = chapterCounts.GetValueOrDefault(DirtyStatus.MATCHES_NEW);

        Program.Log(
            $"Stats: Total malformed chapters: {cleanChaptersCount} not user-modified, {dirtyChaptersCount} user-modified, {matchesNewChaptersCount} already matches new parser."
        );
    }
}
