using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Paratext.Data.ProjectComments;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextService
    {
        void Init();
        Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret);
        string GetParatextUsername(UserSecret userSecret);
        Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId);
        Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(UserSecret userSecret, string projectId);
        bool IsProjectLanguageRightToLeft(UserSecret userSecret, string ptProjectId);

        Task<IReadOnlyList<ParatextResource>> GetResourcesAsync(string userId);
        Task<string> GetResourcePermissionAsync(string paratextId, string userId);
        Task<IReadOnlyDictionary<string, string>> GetParatextUsernameMappingAsync(UserSecret userSecret,
            string paratextId);
        Task<Dictionary<string, string>> GetPermissionsAsync(UserSecret userSecret, SFProject project,
            IReadOnlyDictionary<string, string> ptUsernameMapping, int book = 0, int chapter = 0);

        IReadOnlyList<int> GetBookList(UserSecret userSecret, string ptProjectId);
        string GetBookText(UserSecret userSecret, string ptProjectId, int bookNum);
        Task PutBookText(UserSecret userSecret, string ptProjectId, int bookNum, string usx,
            Dictionary<int, string> chapterAuthors = null);
        string GetNotes(UserSecret userSecret, string ptProjectId, int bookNum);
        IEnumerable<CommentThread> GetCommentThreads(UserSecret userSecret, string projectId, int bookNum);
        void PutNotes(UserSecret userSecret, string ptProjectId, string notesText);
        CommentTags GetCommentTags(UserSecret userSecret, string ptProjectId);
        Task SendReceiveAsync(UserSecret userSecret, string ptTargetId, IProgress<ProgressState> progress = null);
    }
}
