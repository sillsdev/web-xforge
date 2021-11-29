using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Realtime;
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
        Task CancelSyncAsync(string curUserId, string projectId);
        Task<bool> InviteAsync(string curUserId, string projectId, string email, string locale, string role);
        Task<string> GetLinkSharingKeyAsync(string curUserId, string projectId, string role);
        Task<bool> IsAlreadyInvitedAsync(string curUserId, string projectId, string email);
        Task UninviteUserAsync(string curUserId, string projectId, string email);
        Task CheckLinkSharingAsync(string curUserId, string projectId, string shareKey = null);
        Task<IReadOnlyList<InviteeStatus>> InvitedUsersAsync(string curUserId, string projectId);
        bool IsSourceProject(string projectId);
        Task<IEnumerable<TransceleratorQuestion>> TransceleratorQuestions(string curUserId, string projectId);
        Task<bool> HasTransceleratorQuestions(string curUserId, string projectId);
        Task UpdatePermissionsAsync(string curUserId, IDocument<SFProject> projectDoc, CancellationToken token);
    }
}
