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

        IReadOnlyList<int> GetBooks(string projectId);
        string GetBookText(UserSecret userSecret, string projectId, int bookNum);
        void PutBookText(string projectId, int bookNum, string usx);
        string GetNotes(string projectId, int bookNum);
        void PutNotes(string projectId, string notesText);

        void SendReceive(UserSecret userSecret, IEnumerable<string> projectIds);
    }
}
