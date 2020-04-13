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
        Task SetupAccessToPtRegistry(UserSecret userSecret);
        Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret);
        string GetParatextUsername(UserSecret userSecret);
        Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId);
        Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(UserSecret userSecret, string projectId);

        IReadOnlyList<int> GetBookList(string ptProjectId);
        Task<string> GetBookTextAsync(UserSecret userSecret, string ptProjectId, int bookNum);
        void PutBookText(string ptProjectId, int bookNum, string usx);
        string GetNotes(string ptProjectId, int bookNum);
        void PutNotes(UserSecret userSecret, string ptProjectId, string notesText);

        Task SendReceiveAsync(UserSecret userSecret, IEnumerable<string> ptProjectIds,
            SyncProgressDisplay progressDisplay = null);
    }
}
