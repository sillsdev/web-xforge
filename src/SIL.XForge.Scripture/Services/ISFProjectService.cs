using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public interface ISFProjectService : IProjectService
{
    Task<string> CreateProjectAsync(string curUserId, SFProjectCreateSettings settings);
    Task<string> CreateResourceProjectAsync(string curUserId, string paratextId, bool addUser);
    Task DeleteProjectAsync(string curUserId, string projectId);
    Task UpdateSettingsAsync(string curUserId, string projectId, SFProjectSettings settings);
    Task AddTranslateMetricsAsync(string curUserId, string projectId, TranslateMetrics metrics);
    Task<string> SyncAsync(string curUserId, string projectId);
    Task CancelSyncAsync(string curUserId, string projectId);
    Task<bool> InviteAsync(
        string curUserId,
        string projectId,
        string email,
        string locale,
        string role,
        Uri websiteUrl
    );
    Task<string> GetLinkSharingKeyAsync(
        string curUserId,
        string projectId,
        string role,
        string shareLinkType,
        int daysBeforeExpiration
    );
    Task<ValidShareKey> CheckShareKeyValidity(string shareKey);
    Task<SFProject> GetProjectAsync(string projectId);
    SFProjectSecret GetProjectSecretByShareKey(string shareKey);
    Task ReserveLinkSharingKeyAsync(string curUserId, string shareKey, int daysBeforeExpiration);
    Task IncreaseShareKeyUsersGenerated(string shareKey);
    Task<bool> IsAlreadyInvitedAsync(string curUserId, string projectId, string email);
    Task UninviteUserAsync(string curUserId, string projectId, string email);
    Task<string> JoinWithShareKeyAsync(string curUserId, string shareKey);
    Task<IReadOnlyList<InviteeStatus>> InvitedUsersAsync(string curUserId, string projectId);
    bool IsSourceProject(string projectId);
    Task<IEnumerable<TransceleratorQuestion>> TransceleratorQuestionsAsync(string curUserId, string projectId);
    Task UpdatePermissionsAsync(
        string curUserId,
        IDocument<SFProject> projectDoc,
        IReadOnlyList<ParatextProjectUser>? users = null,
        CancellationToken token = default
    );
    Task EnsureWritingSystemTagIsSetAsync(string curUserId, string projectId);
    Task CreateAudioTimingData(
        string userId,
        string projectId,
        int book,
        int chapter,
        List<AudioTiming> timingData,
        string audioUrl
    );
    Task DeleteAudioTimingData(string userId, string projectId, int book, int chapter);
    Task SetPreTranslateAsync(string curUserId, string[] systemRoles, string projectId, bool preTranslate);
    Task SetServalConfigAsync(string curUserId, string[] systemRoles, string projectId, string? servalConfig);
    Task SetDraftAppliedAsync(string userId, string projectId, int book, int chapter, bool draftApplied);
    Task SetIsValidAsync(string userId, string projectId, int book, int chapter, bool draftApplied);
}
