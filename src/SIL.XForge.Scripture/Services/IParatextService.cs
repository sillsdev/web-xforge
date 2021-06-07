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
        Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(UserSecret userSecret, string paratextId);
        bool IsProjectLanguageRightToLeft(UserSecret userSecret, string paratextId);

        Task<IReadOnlyList<ParatextResource>> GetResourcesAsync(string userId);
        bool IsResource(string paratextId);
        Task<string> GetResourcePermissionAsync(string paratextId, string userId);
        Task<IReadOnlyDictionary<string, string>> GetParatextUsernameMappingAsync(UserSecret userSecret,
            string paratextId);
        Task<Dictionary<string, string>> GetPermissionsAsync(UserSecret userSecret, SFProject project,
            IReadOnlyDictionary<string, string> ptUsernameMapping, int book = 0, int chapter = 0);

        IReadOnlyList<int> GetBookList(UserSecret userSecret, string paratextId);
        string GetBookText(UserSecret userSecret, string paratextId, int bookNum);
        Task PutBookText(UserSecret userSecret, string paratextId, int bookNum, string usx,
            Dictionary<int, string> chapterAuthors = null);
        string GetNotes(UserSecret userSecret, string paratextId, int bookNum);
        void PutNotes(UserSecret userSecret, string paratextId, string notesText);
        string GetLatestSharedVersion(UserSecret userSecret, string paratextId);

        Task SendReceiveAsync(UserSecret userSecret, string paratextId, IProgress<ProgressState> progress = null);
    }
}
