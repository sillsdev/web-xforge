using System;
using System.Collections.Generic;
using System.Threading.Tasks;
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

        IReadOnlyList<ParatextResource> GetResources(UserSecret userSecret);
        Task<string> GetResourcePermissionAsync(UserSecret userSecret, string paratextId, string userId);
        Task<Dictionary<string, string>> GetPermissionsAsync(UserSecret userSecret, SFProject project,
            int book = 0, int chapter = 0);

        IReadOnlyList<int> GetBookList(UserSecret userSecret, string ptProjectId);
        string GetBookText(UserSecret userSecret, string ptProjectId, int bookNum);
        Task PutBookText(UserSecret userSecret, string ptProjectId, int bookNum, string usx,
            Dictionary<int, string> chapterAuthors = null);
        string GetNotes(UserSecret userSecret, string ptProjectId, int bookNum);
        void PutNotes(UserSecret userSecret, string ptProjectId, string notesText);

        Task SendReceiveAsync(UserSecret userSecret, string ptTargetId, IProgress<ProgressState> progress = null);
    }
}
