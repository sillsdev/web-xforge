using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public interface ISFProjectService : IProjectService<SFProject>
    {
        Task UpdateTasksAsync(string userId, string projectId, UpdateTasksParams parameters);
        Task AddTranslateMetricsAsync(string userId, string projectId, TranslateMetrics metrics);
        Task SyncAsync(string userId, string projectId);
    }
}
