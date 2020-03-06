using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextService
    {
        Task DevEntryPoint(UserSecret userSecret);
        void Init();

        Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret);
        string GetParatextUsername(UserSecret userSecret);
        Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId);
        Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(UserSecret userSecret, string projectId);
        // bool IsManagingProject(string projectId);

        IReadOnlyList<int> GetBookList(string ptProjectId);
        Task<string> GetBookTextAsync(UserSecret userSecret, string ptProjectId, int bookNum);
        string PutBookText(string ptProjectId, int bookNum, string revision, string usx);
        string GetNotes(string ptProjectId, int bookNum);
        void PutNotes(string ptProjectId, string notesText);

        Task SendReceiveAsync(UserSecret userSecret, IEnumerable<string> ptProjectIds);
    }
}
