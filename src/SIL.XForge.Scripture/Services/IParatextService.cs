using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextService
    {
        void Init();
        Task<bool> CanUserAuthenticateToPTRegistryAsync(UserSecret userSecret);
        Task<bool> CanUserAuthenticateToPTArchivesAsync(string userSFId);
        Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret);
        string? GetParatextUsername(UserSecret userSecret);
        Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId, CancellationToken token);
        Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(
            UserSecret userSecret,
            SFProject project,
            CancellationToken token
        );
        ParatextSettings GetParatextSettings(UserSecret userSecret, string paratextId);

        Task<IReadOnlyList<ParatextResource>> GetResourcesAsync(string userId);
        bool IsResource(string paratextId);
        Task<string> GetResourcePermissionAsync(string paratextId, string userId, CancellationToken token);
        Task<IReadOnlyDictionary<string, string>> GetParatextUsernameMappingAsync(
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
            string usx,
            Dictionary<int, string> chapterAuthors = null
        );
        string GetNotes(UserSecret userSecret, string ptProjectId, int bookNum);
        SyncMetricInfo PutNotes(UserSecret userSecret, string ptProjectId, string notesText);
        Task<SyncMetricInfo> UpdateParatextCommentsAsync(
            UserSecret userSecret,
            string projectId,
            int bookNum,
            IEnumerable<IDocument<NoteThread>> noteThreadDocs,
            Dictionary<string, ParatextUserProfile> ptProjectUsers
        );
        IEnumerable<NoteThreadChange> GetNoteThreadChanges(
            UserSecret userSecret,
            string projectId,
            int bookNum,
            IEnumerable<IDocument<NoteThread>> noteThreadDocs,
            Dictionary<int, ChapterDelta> chapterDeltas,
            Dictionary<string, ParatextUserProfile> ptProjectUsers
        );
        string? GetLatestSharedVersion(UserSecret userSecret, string paratextId);
        bool BackupExists(UserSecret userSecret, string paratextId);
        bool BackupRepository(UserSecret userSecret, string paratextId);
        bool RestoreRepository(UserSecret userSecret, string paratextId);

        Task<ParatextProject> SendReceiveAsync(
            UserSecret userSecret,
            string paratextId,
            IProgress<ProgressState> progress = null,
            CancellationToken token = default
        );
    }
}
