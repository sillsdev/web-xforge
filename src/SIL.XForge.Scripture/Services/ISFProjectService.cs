using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public interface ISFProjectService : IProjectService
    {
        Task<string> CreateProjectAsync(string userId, SFProject newProject);
        Task DeleteProjectAsync(string userId, string projectId);
        Task UpdateSettingsAsync(string userId, string projectId, SFProjectSettings settings);
        Task AddTranslateMetricsAsync(string userId, string projectId, TranslateMetrics metrics);
        Task SyncAsync(string userId, string projectId);
    }
}
