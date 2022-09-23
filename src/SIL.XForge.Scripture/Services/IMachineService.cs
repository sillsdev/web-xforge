using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineService
    {
        Task AddProjectAsync(string curUserId, string projectId);
        Task BuildProjectAsync(string curUserId, string projectId);
        Task RemoveProjectAsync(string curUserId, string projectId);
    }
}
