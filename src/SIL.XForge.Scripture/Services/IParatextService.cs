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
        bool IsProjectLanguageRightToLeft(UserSecret userSecret, string ptProjectId, TextType textType);

        IReadOnlyList<ParatextResource> GetResources(UserSecret userSecret);
        Task<Dictionary<string, string>> GetPermissions(UserSecret _userSecret, SFProject project, TextType textType);

        IReadOnlyList<int> GetBookList(UserSecret userSecret, string ptProjectId, TextType textType);
        string GetBookText(UserSecret userSecret, string ptProjectId, int bookNum, TextType textType);
        void PutBookText(UserSecret userSecret, string ptProjectId, int bookNum, string usx);
        string GetNotes(UserSecret userSecret, string ptProjectId, int bookNum);
        void PutNotes(UserSecret userSecret, string ptProjectId, string notesText);

        Task SendReceiveAsync(UserSecret userSecret, string ptTargetId, string ptSourceId,
            IProgress<ProgressState> progress = null);
    }
}
