using System.Linq;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    public interface IRealtimeService
    {
        void StartServer();
        void StopServer();

        Task<IConnection> ConnectAsync(string userId = null);

        string GetCollectionName<T>() where T : IIdentifiable;

        IQueryable<T> QuerySnapshots<T>() where T : IIdentifiable;

        Task DeleteProjectAsync(string projectId);
        Task DeleteUserAsync(string userId);

        Task<string> GetLastModifiedUserIdAsync<T>(string id, int version) where T : IIdentifiable;
    }
}
