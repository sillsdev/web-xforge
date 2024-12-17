using System.Data;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using DiffPlex.DiffBuilder;
using DiffPlex.DiffBuilder.Model;
using SIL.ObjectModel;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace WhitespaceRestoreMigration;

enum DirtyStatus
{
    CLEAN,
    DIRTY,
    MATCHES_NEW,
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
        _projectStats.Columns.Add("NotLoad", typeof(bool));
        _projectStats.Columns.Add("BusySyncing", typeof(bool));
        _projectStats.Columns.Add("IsResource", typeof(bool));
        _projectStats.Columns.Add("NoAdequateUser", typeof(bool));
        _projectStats.Columns.Add("NullSyncedToRepositoryVersion", typeof(bool));
        _projectStats.Columns.Add("HasMalformedText", typeof(bool));
        _projectStats.Columns.Add("Error", typeof(bool));
        _projectStats.Columns.Add("SyncWasAlreadyDisabled", typeof(bool));
        _projectStats.Columns.Add("SyncShouldStayDisabled", typeof(bool));
        _projectStats.Columns.Add("SyncShouldLaterBeReenabled", typeof(bool));
        _projectStats.Columns.Add("SyncWasReenabled", typeof(bool));
    }

    public async Task<bool> MigrateAsync(
        bool writeMode,
        bool listProjectsMode,
        ICollection<string> sfProjectIdsToMigrate,
        IDictionary<string, string> sfUsersToUse
    )
    {
        bool allSuccess = true;
        // Migration may take a long time. Projects have sync disabled after they are migrated. So migrate recently
        // used projects last so more active projects don't have to wait as long while their sync is disabled.
        List<string> sfProjectIds = await _realtimeService
            .QuerySnapshots<SFProject>()
            .OrderBy(proj => proj.Sync.DateLastSuccessfulSync)
            .Select(proj => proj.Id)
            .ToListAsync();

        // If we are only to migrate some projects, restrict this list to them
        if (sfProjectIdsToMigrate.Any())
            sfProjectIds.RemoveAll(pid => !sfProjectIdsToMigrate.Contains(pid));

        string ids = string.Join(" ", sfProjectIds);
        int count = sfProjectIds.Count;
        Program.Log($"Working on {count} projects with these SF project ids: {ids}");

        if (listProjectsMode)
        {
            Program.Log($"No further processing for list-projects mode.");
            return true;
        }

        IConnection conn = await _realtimeService.ConnectAsync();
        try
        {
            int iteration = 0;
            foreach (string sfProjectId in sfProjectIds)
            {
                iteration++;
                _projectStats.Rows.Add(sfProjectId);

                IDocument<SFProject> sfProjectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
                if (!sfProjectDoc.IsLoaded)
                {
                    Program.Log($"sf proj {sfProjectId}: Skipping project that would not load.");
                    _projectStats.Rows.Find(sfProjectId)!["NotLoad"] = true;
                    continue;
                }
                SFProject project = sfProjectDoc.Data;

                if (_paratextService.IsResource(project.ParatextId))
                {
                    Program.Log($"sf proj {project.Id}: Skipping resource.");
                    _projectStats.Rows.Find(project.Id)!["IsResource"] = true;
                    continue;
                }

                Program.Log($"sf proj {project.Id}: Migrating project {project.Name} ({iteration}/{count})");

                bool syncBeganDisabled = project.SyncDisabled;
                if (syncBeganDisabled)
                {
                    Program.Log($"sf proj {project.Id}: Warning: project sync was already disabled. Continuing.");
                    _projectStats.Rows.Find(project.Id)!["SyncWasAlreadyDisabled"] = true;
                }
                // Disable sync for the project. Even in read-mode since we `hg checkout` a revision in the project
                // repo dir.
                await SetSyncDisabledAsync(sfProjectDoc, true);

                // Wait for an existing sync to finish
                sfProjectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
                project = sfProjectDoc.Data;
                // (How to tell a project is syncing, from ParatextSyncRunner.CompleteSync().)
                bool projectIsSyncing = project.Sync.QueuedCount > 0;
                if (projectIsSyncing)
                {
                    int generousSyncWaitTimeMinutes = 20;
                    Program.Log(
                        $"sf proj {project.Id}: Waiting {generousSyncWaitTimeMinutes} minutes for project to finish existing sync."
                    );
                    await Task.Delay(TimeSpan.FromMinutes(generousSyncWaitTimeMinutes));
                    sfProjectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
                    project = sfProjectDoc.Data;
                    projectIsSyncing = project.Sync.QueuedCount > 0;
                    if (projectIsSyncing)
                    {
                        Program.Log(
                            $"sf proj {project.Id}: Project has been syncing for over {generousSyncWaitTimeMinutes} minutes. It is probably not really syncing. Processing."
                        );
                        _projectStats.Rows.Find(project.Id)!["BusySyncing"] = true;
                    }
                    else
                    {
                        Program.Log($"sf proj {project.Id}: Project finished syncing. Processing.");
                    }
                }

                IEnumerable<string> projectPtAdminUserIds = project
                    .UserRoles.Where(ur => ur.Value == SFProjectRole.Administrator)
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

                    if (writeMode)
                    {
                        // The SF-1444 fix will soon be applied, and this project should not be synced until it can be
                        // properly migrated.
                        _projectStats.Rows.Find(project.Id)!["SyncShouldStayDisabled"] = true;
                    }
                    else
                    {
                        await SetSyncDisabledUnlessBeganDisabledAsync(sfProjectDoc, syncBeganDisabled, false);
                    }

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
                try
                {
                    conn.BeginTransaction();
                    await ProcessProjectAsync(writeMode, project, sfUserId, conn);
                    await conn.CommitTransactionAsync();
                }
                catch (Exception e)
                {
                    _projectStats.Rows.Find(project.Id)!["Error"] = true;
                    Program.Log(
                        $"sf proj {project.Id}: Error: Unhandled error while processing project. Rolling back transaction and skipping project. Exception thrown: {e}"
                    );
                    conn.RollbackTransaction();
                    if (writeMode)
                    {
                        _projectStats.Rows.Find(project.Id)!["SyncShouldStayDisabled"] = true;
                    }
                    else
                    {
                        await SetSyncDisabledUnlessBeganDisabledAsync(sfProjectDoc, syncBeganDisabled, false);
                    }
                    allSuccess = false;
                    continue;
                }

                if (writeMode)
                {
                    // Where there were no problems, sync was not already disabled, and we are in write mode and so won't
                    // re-enable sync in the migrator, mark the project to need sync later re-enabled.
                    if (!syncBeganDisabled)
                    {
                        _projectStats.Rows.Find(project.Id)!["SyncShouldLaterBeReenabled"] = true;
                    }
                }
                else
                {
                    // Re-enable sync for project, but only if it was enabled to begin with, and only if we are in
                    // read-mode.
                    await SetSyncDisabledUnlessBeganDisabledAsync(sfProjectDoc, syncBeganDisabled, false);
                }
            }
        }
        catch (Exception e)
        {
            Program.Log($"Error: Exception thrown: {e}");
            Program.Log(
                $"Warning: Migration activity will be printed, but it was not from a successful or complete run."
            );
            return false;
        }
        finally
        {
            ReportStats();
            conn?.Dispose();
        }

        return allSuccess;
    }

    private async Task SetSyncDisabledUnlessBeganDisabledAsync(
        IDocument<SFProject> sfProjectDoc,
        bool syncBeganDisabled,
        bool syncDisabled
    )
    {
        if (syncBeganDisabled)
        {
            return;
        }
        await SetSyncDisabledAsync(sfProjectDoc, syncDisabled);
        if (!syncDisabled)
        {
            _projectStats.Rows.Find(sfProjectDoc.Id)!["SyncWasReenabled"] = true;
        }
    }

    private static async Task SetSyncDisabledAsync(IDocument<SFProject> sfProjectDoc, bool syncDisabled) =>
        await sfProjectDoc.SubmitJson0OpAsync(opBuilder => opBuilder.Set(proj => proj.SyncDisabled, syncDisabled));

    /// <summary>
    /// Disposes managed resources.
    /// </summary>
    protected override void DisposeManagedResources() { }

    /// <returns>If successful</returns>
    private async Task ProcessProjectAsync(bool writeMode, SFProject project, string sfUserId, IConnection conn)
    {
        UserSecret? userSecret = _userSecretRepo.Query().FirstOrDefault((UserSecret us) => us.Id == sfUserId);
        if (userSecret == null)
        {
            throw new Exception(
                $"When processing SF project id {project.Id}, could not find user secret for SF user id {sfUserId}."
            );
        }

        try
        {
            // Manage memory usage somewhat better, by initializing and freeing the comment manager.
            _paratextService.InitializeCommentManager(userSecret, project.ParatextId);

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
                _paratextService.SetRepoToRevision(
                    userSecret,
                    project.ParatextId,
                    project.Sync.SyncedToRepositoryVersion
                );
            }
            foreach (TextInfo bookInfo in project.Texts)
            {
                await ProcessBookAsync(writeMode, project, userSecret, bookInfo, conn);
            }
        }
        finally
        {
            _paratextService.ClearParatextDataCaches(userSecret, project.ParatextId);
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
        DisplayXDocumentDiff(oldParser, newParser);

        List<string> allProjectChapterTextDocIds = project
            .Texts.SelectMany(t => t.Chapters.Select(c => TextData.GetTextDocId(project.Id, t.BookNum, c.Number)))
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
        ChapterDelta chapterDeltaInSFDB = new(
            chapter.Number,
            chapter.LastVerse,
            chapter.IsValid,
            chapterTextDocInSFDB.Data
        );

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
        }
        else if (sfChapterIsUnchangedFromOlderParserOutput)
        {
            Program.Log(
                $"sf proj {project.Id}: book {bookInfo.BookNum}: chap {chapter.Number}: Text was not modified in SF since import from old parser. {(writeMode ? "Replacing in SF with newly parsed data." : "Not changing, since in read-only mode.")}"
            );
            _problemStats.Rows.Add(project.Id, bookInfo.BookNum, chapter.Number, DirtyStatus.CLEAN);
            Delta patch = chapterTextDocInSFDB.Data.Diff(chapterDeltaFromNewParseOfUsx.Delta);
            // Program.Log($"sf proj {project.Id}: book {bookInfo.BookNum}: chap {chapter.Number}: patch to fix: {patch}");
            if (writeMode)
            {
                if (patch.Ops.Count > 0)
                    await chapterTextDocInSFDB.SubmitOpAsync(patch);
            }
        }
        else
        {
            // If the chapter text in SF DB has been modified from it's import by an older parsing of the USX,
            // leave it alone so we don't overwrite any user edits.
            Program.Log(
                $"sf proj {project.Id}: book {bookInfo.BookNum}: chap {chapter.Number}: Text was modified in SF since import from old parser. Skipping."
            );
            _problemStats.Rows.Add(project.Id, bookInfo.BookNum, chapter.Number, DirtyStatus.DIRTY);
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

        try
        {
            // Before we try something new, can we even round-trip the existing data?
            XDocument usxWithOUTChapterModification = _deltaUsxMapper.ToUsx(usx, chapterDeltas.Values.ToArray());
        }
        catch
        {
            Program.Log(
                $"When processing chapter {chapterNumber}, we couldn't roundtrip with DeltaUsxMapper, before checking if the USX already incorporates a different chapter delta. Cannot migrate project. Rethrowing."
            );
            throw;
        }

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
            IDocument<TextData>? textDoc = docs.FirstOrDefault(d =>
                d.Id == TextData.GetTextDocId(project.Id, text.BookNum, chapter.Number)
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
            .GroupBy(row => new
            {
                SFProjectId = row.Field<string>("SFProjectId"),
                DirtyStatus = row.Field<DirtyStatus>("DirtyStatus"),
            })
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
        Program.Log($"Stats: Projects stopped at NotLoad: {_projectStats.Select("NotLoad = true").Length}");
        Program.Log($"Stats: Projects stopped at IsResource: {_projectStats.Select("IsResource = true").Length}");
        IEnumerable<string?> projectsNoUser = _projectStats
            .Select("NoAdequateUser = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log($"Stats: Projects stopped at NoAdequateUser: {projectsNoUser.Count()}");
        Program.Log(
            $"Stats: Projects with NullSyncedToRepositoryVersion: {_projectStats.Select("NullSyncedToRepositoryVersion = true").Length}"
        );
        IEnumerable<string?> projectsWithNeed = _projectStats
            .Select("HasMalformedText = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log($"Stats: Projects with HasMalformedText: {projectsWithNeed.Count()}");
        IEnumerable<string?> projectsWithError = _projectStats
            .Select("Error = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log($"Stats: Projects with Error: {projectsWithError.Count()}");
        IEnumerable<string?> projectsWithNotLoad = _projectStats
            .Select("NotLoad = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log($"Stats: Projects with NotLoad: {projectsWithNotLoad.Count()}");
        IEnumerable<string?> projectsWithBusySyncing = _projectStats
            .Select("BusySyncing = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log($"Stats: Projects with BusySyncing: {projectsWithBusySyncing.Count()}");

        Dictionary<DirtyStatus, int> chapterCounts = _problemStats
            .AsEnumerable()
            .GroupBy(row => row.Field<DirtyStatus>("DirtyStatus"))
            .ToDictionary(group => group.Key, group => group.Count());

        int cleanChaptersCount = chapterCounts.GetValueOrDefault(DirtyStatus.CLEAN);
        int dirtyChaptersCount = chapterCounts.GetValueOrDefault(DirtyStatus.DIRTY);
        int matchesNewChaptersCount = chapterCounts.GetValueOrDefault(DirtyStatus.MATCHES_NEW);

        Program.Log(
            $"Stats: Total malformed chapters: {cleanChaptersCount} not user-modified, {dirtyChaptersCount} user-modified, {matchesNewChaptersCount} already matches new parser."
        );

        IEnumerable<string?> projectsUnprocessable = projectsNoUser
            .Concat(projectsWithError)
            .Concat(projectsWithNotLoad);
        Program.Log(
            $"Stats: The following non-resource projects could not be fully processed ({projectsUnprocessable.Count()}): {string.Join(" ", projectsUnprocessable)}"
        );
        Program.Log(
            $"Stats: The following projects need or needed migrated, based on parser comparison alone (not what was in SF DB) ({projectsWithNeed.Count()}): {string.Join(" ", projectsWithNeed)}"
        );

        IEnumerable<string?> projectsSyncWasAlreadyDisabled = _projectStats
            .Select("SyncWasAlreadyDisabled = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log(
            $"Stats: Projects that had sync already disabled ({projectsSyncWasAlreadyDisabled.Count()}): {string.Join(" ", projectsSyncWasAlreadyDisabled)}"
        );

        IEnumerable<string?> projectsShouldStayDisabled = _projectStats
            .Select("SyncShouldStayDisabled = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log(
            $"Stats: Projects that newly have sync disabled and should be left that way ({projectsShouldStayDisabled.Count()}): {string.Join(" ", projectsShouldStayDisabled)}"
        );

        IEnumerable<string?> projectsShouldLaterBeReenabled = _projectStats
            .Select("SyncShouldLaterBeReenabled = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log(
            $"Stats: Projects that should have sync re-enabled after applying SF-1444 fix ({projectsShouldLaterBeReenabled.Count()}): {string.Join(" ", projectsShouldLaterBeReenabled)}"
        );

        IEnumerable<string?> projectsSyncWasReenabled = _projectStats
            .Select("SyncWasReenabled = true")
            .Select((DataRow row) => row["SFProjectID"].ToString());
        Program.Log(
            $"Stats: Projects that had sync re-enabled ({projectsSyncWasReenabled.Count()}): {string.Join(" ", projectsSyncWasReenabled)}"
        );
    }

    /// <summary>
    /// XDocument.ToString() sometimes pretty-prints the output, such as with indentation that is not from actual
    /// text nodes in the document. Conversely, this method returns a string representation of an XDocument without
    /// formatting, which can be useful when paying attention to what whitespace is really in the XDocument.
    /// </summary>
    public static string XDocumentToStringUnformatted(XDocument inputUsx)
    {
        using MemoryStream stream = new();
        inputUsx.Save(stream, SaveOptions.DisableFormatting);
        byte[] rawBytes = stream.ToArray();
        string usx = System.Text.Encoding.UTF8.GetString(rawBytes);
        // The usx element starts after a BOM and xml declaration.
        string endOfDeclaration = "?>";
        int start = usx.IndexOf(endOfDeclaration) + endOfDeclaration.Length;
        usx = usx[start..];
        return usx;
    }

    private static void DisplayXDocumentDiff(XDocument fromOldParser, XDocument fromNewParser)
    {
        const char spaceRepresentation = '\u23b5';
        string oldParserResult = XDocumentToStringUnformatted(fromOldParser)
            .Replace("<verse", "\n<verse")
            .Replace(' ', spaceRepresentation);

        string newParserResult = XDocumentToStringUnformatted(fromNewParser)
            .Replace("<verse", "\n<verse")
            .Replace(' ', spaceRepresentation);

        string oldWithoutTrailingSpaces = oldParserResult.Replace($"{spaceRepresentation}\n", "\n");
        string newWithoutTrailingSpaces = newParserResult.Replace($"{spaceRepresentation}\n", "\n");

        bool onlyAdditionOfSingleTrailingSpaces = oldWithoutTrailingSpaces == newWithoutTrailingSpaces;

        if (onlyAdditionOfSingleTrailingSpaces)
        {
            Program.Log(
                $"Note: The new parser output only differs from the old parser output by the addition or removal of single trailing spaces. (A)"
            );
            // Don't bother showing diff.
            return;
        }

        bool orOnlyInsertionOfSingleSpaceBetweenElements =
            oldWithoutTrailingSpaces.Replace($">{spaceRepresentation}<", "><")
            == newWithoutTrailingSpaces.Replace($">{spaceRepresentation}<", "><");
        if (orOnlyInsertionOfSingleSpaceBetweenElements)
        {
            Program.Log(
                $"Note: The new parser output only differs from the old parser output by the insertion or removal of single spaces between elements, or single trailing spaces. (B)"
            );
        }
        else
        {
            Program.Log(
                $"Note: The new parser output differs from the old parser output by more than just the addition or removal of single trailing spaces or single spaces between elements. (C)"
            );
        }

        Program.Log($"Difference between old parser output and new parser output:");

        DiffPaneModel diff = InlineDiffBuilder.Diff(oldParserResult, newParserResult, ignoreWhiteSpace: false);

        foreach (DiffPiece line in diff.Lines)
        {
            switch (line.Type)
            {
                case DiffPlex.DiffBuilder.Model.ChangeType.Deleted:
                    Console.WriteLine("-" + line.Text);
                    break;
                case DiffPlex.DiffBuilder.Model.ChangeType.Inserted:
                    Console.WriteLine("+" + line.Text);
                    break;
                case DiffPlex.DiffBuilder.Model.ChangeType.Unchanged:
                    break;
                default:
                    Console.WriteLine($"A difference line was of an unexpected type ({line.Type}): {line.Text}");
                    break;
            }
        }
    }
}
