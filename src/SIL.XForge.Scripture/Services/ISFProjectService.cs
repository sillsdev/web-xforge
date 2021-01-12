using System.Threading.Tasks;
using System.Collections.Generic;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public interface ISFProjectService : IProjectService
    {
        Task<string> CreateProjectAsync(string curUserId, SFProjectCreateSettings settings);
        Task<string> CreateResourceProjectAsync(string curUserId, string paratextId);
        Task DeleteProjectAsync(string curUserId, string projectId);
        Task UpdateSettingsAsync(string curUserId, string projectId, SFProjectSettings settings);
        Task AddTranslateMetricsAsync(string curUserId, string projectId, TranslateMetrics metrics);
        Task SyncAsync(string curUserId, string projectId);
        Task<bool> InviteAsync(string curUserId, string projectId, string email);
        Task<bool> IsAlreadyInvitedAsync(string curUserId, string projectId, string email);
        Task UninviteUserAsync(string curUserId, string projectId, string email);
        Task CheckLinkSharingAsync(string curUserId, string projectId, string shareKey = null);
        Task<string[]> InvitedUsersAsync(string curUserId, string projectId);
        Task<IEnumerable<TransceleratorQuestion>> TransceleratorQuestions(string curUserId, string projectId);
        Task<bool> HasTransceleratorQuestions(string curUserId, string projectId);
    }
}
