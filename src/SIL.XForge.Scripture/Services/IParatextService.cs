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
        bool IsProjectLanguageRightToLeft(UserSecret userSecret, string paratextId, IScrTextCollection scrTextCollection);

        Task<IReadOnlyList<ParatextResource>> GetResourcesAsync(string userId);
        bool IsResource(string paratextId);
        Task<string> GetResourcePermissionAsync(string paratextId, string userId);
        Task<IReadOnlyDictionary<string, string>> GetParatextUsernameMappingAsync(UserSecret userSecret,
            string paratextId);
        Task<Dictionary<string, string>> GetPermissionsAsync(UserSecret userSecret, SFProject project,
            IScrTextCollection scrTextCollection, IReadOnlyDictionary<string, string> ptUsernameMapping,
            int book = 0, int chapter = 0);

        IReadOnlyList<int> GetBookList(UserSecret userSecret, string paratextId, IScrTextCollection scrTextCollection);
        string GetBookText(UserSecret userSecret, string paratextId, int bookNum, IScrTextCollection scrTextCollection);
        Task PutBookText(UserSecret userSecret, string paratextId, int bookNum, string usx,
            IScrTextCollection scrTextCollection, Dictionary<int, string> chapterAuthors = null);
        string GetNotes(UserSecret userSecret, string paratextId, int bookNum, IScrTextCollection scrTextCollection);
        void PutNotes(UserSecret userSecret, string paratextId, string notesText, IScrTextCollection scrTextCollection);
        string GetLatestSharedVersion(UserSecret userSecret, string paratextId, IScrTextCollection scrTextCollection);

        Task SendReceiveAsync(UserSecret userSecret, string paratextId, IScrTextCollection scrTextCollection,
            IProgress<ProgressState> progress = null);
    }
}
