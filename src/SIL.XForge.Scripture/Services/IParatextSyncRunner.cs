using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextSyncRunner
    {
        Task RunAsync(string projectId, string userId, bool trainEngine);
    }
}
