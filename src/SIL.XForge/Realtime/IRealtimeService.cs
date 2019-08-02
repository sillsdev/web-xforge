using System.Linq;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime
{
    public interface IRealtimeService
    {
        void StartServer();
        void StopServer();

        Task<IConnection> ConnectAsync();

        string GetCollectionName(string type);

        IQueryable<T> QuerySnapshots<T>(string type) where T : IIdentifiable;

        Task DeleteProjectAsync(string projectId);
    }
}
