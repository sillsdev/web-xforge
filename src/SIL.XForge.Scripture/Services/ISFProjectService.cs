using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public interface ISFProjectService : IProjectService
    {
        Task<string> CreateProjectAsync(string curUserId, SFProject newProject);
        Task DeleteProjectAsync(string curUserId, string projectId);
        Task UpdateSettingsAsync(string curUserId, string projectId, SFProjectSettings settings);
        Task AddTranslateMetricsAsync(string curUserId, string projectId, TranslateMetrics metrics);
        Task SyncAsync(string curUserId, string projectId);
    }
}
