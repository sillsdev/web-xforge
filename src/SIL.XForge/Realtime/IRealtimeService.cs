using System.Threading.Tasks;

namespace SIL.XForge.Realtime
{
    public interface IRealtimeService
    {
        void StartServer();
        void StopServer();

        Task<IConnection> ConnectAsync();

        string GetCollectionName(string type);

        Task DeleteProjectDocsAsync(string type, string projectId);
    }
}
