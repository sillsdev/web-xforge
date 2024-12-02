using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

public interface IParatextService
{
    void Init();
    Task<bool> CanUserAuthenticateToPTRegistryAsync(UserSecret userSecret);
    Task<bool> CanUserAuthenticateToPTArchivesAsync(string userSFId);
    Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret);
    string? GetParatextUsername(UserSecret userSecret);
    void ForceParatextUsername(string username, string forcedUsername);
    void ClearForcedUsernames();
    Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId, CancellationToken token);
    ParatextSettings? GetParatextSettings(UserSecret userSecret, string paratextId);

    Task<IReadOnlyList<ParatextResource>> GetResourcesAsync(string userId);
    bool IsResource(string paratextId);
    Task<string> GetResourcePermissionAsync(string paratextId, string userId, CancellationToken token);
    Task<IReadOnlyList<ParatextProjectUser>> GetParatextUsersAsync(
        UserSecret userSecret,
        SFProject project,
        CancellationToken token
    );
    Task<Dictionary<string, string>> GetPermissionsAsync(
        UserSecret userSecret,
        SFProject project,
        IReadOnlyDictionary<string, string> ptUsernameMapping,
        int book = 0,
        int chapter = 0,
        CancellationToken token = default
    );
    bool ResourceDocsNeedUpdating(SFProject project, ParatextResource resource);

    IReadOnlyList<int> GetBookList(UserSecret userSecret, string paratextId);
    string GetBookText(UserSecret userSecret, string paratextId, int bookNum);
    Task<int> PutBookText(
        UserSecret userSecret,
        string paratextId,
        int bookNum,
        XDocument usx,
        Dictionary<int, string> chapterAuthors = null
    );
    string GetNotes(UserSecret userSecret, string paratextId, int bookNum);
    SyncMetricInfo PutNotes(UserSecret userSecret, string paratextId, XElement notesElement);
    Task<SyncMetricInfo> UpdateParatextCommentsAsync(
        UserSecret userSecret,
        string paratextId,
        IEnumerable<IDocument<NoteThread>> noteThreadDocs,
        IReadOnlyDictionary<string, string> userIdsToUsernames,
        Dictionary<string, ParatextUserProfile> ptProjectUsers,
        int sfNoteTagId
    );
    IEnumerable<NoteThreadChange> GetNoteThreadChanges(
        UserSecret userSecret,
        string paratextId,
        int? bookNum,
        IEnumerable<IDocument<NoteThread>> noteThreadDocs,
        Dictionary<int, ChapterDelta> chapterDeltas,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    );
    int UpdateCommentTag(UserSecret userSecret, string paratextId, NoteTag noteTag);
    Task<BiblicalTermsChanges> GetBiblicalTermsAsync(UserSecret userSecret, string paratextId, IEnumerable<int> books);
    void UpdateBiblicalTerms(UserSecret userSecret, string paratextId, IReadOnlyList<BiblicalTerm> biblicalTerms);
    string? GetLatestSharedVersion(UserSecret userSecret, string paratextId);
    string GetRepoRevision(UserSecret userSecret, string paratextId);
    void SetRepoToRevision(UserSecret userSecret, string paratextId, string desiredRevision);
    bool BackupExists(UserSecret userSecret, string paratextId);
    bool BackupRepository(UserSecret userSecret, string paratextId);
    bool RestoreRepository(UserSecret userSecret, string paratextId);
    bool LocalProjectDirExists(string paratextId);
    (string region, string script, string tag) GetLanguageId(UserSecret userSecret, string paratextId);
    void ClearParatextDataCaches(UserSecret userSecret, string paratextId);
    void InitializeCommentManager(UserSecret userSecret, string paratextId);

    Task<TextSnapshot> GetSnapshotAsync(
        UserSecret userSecret,
        string sfProjectId,
        string book,
        int chapter,
        DateTime timestamp
    );

    IAsyncEnumerable<DocumentRevision> GetRevisionHistoryAsync(
        UserSecret userSecret,
        string sfProjectId,
        string book,
        int chapter
    );

    Task<Delta> GetDeltaFromUsfmAsync(string curUserId, string sfProjectId, string usfm, int bookNum);

    Task<ParatextProject> SendReceiveAsync(
        UserSecret userSecret,
        string paratextId,
        IProgress<ProgressState> progress = null,
        CancellationToken token = default,
        SyncMetrics syncMetrics = null
    );
}
