#nullable disable warnings
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides data and processing operations for onboarding requests used by the onboarding JSON-RPC controller.
/// </summary>
public interface IOnboardingRequestService
{
    Task<string> SubmitOnboardingRequestAsync(
        string userId,
        string projectId,
        OnboardingRequestFormData formData,
        Uri siteRoot
    );

    Task<object> GetOpenOnboardingRequestAsync(string projectId);

    Task<List<OnboardingRequest>> GetAllRequestsAsync();

    Task<OnboardingRequest> GetRequestByIdAsync(string requestId);

    Task<OnboardingRequest> SetAssigneeAsync(string requestId, string assigneeId);

    Task<OnboardingRequest> SetResolutionAsync(string requestId, string? resolution);

    Task<OnboardingRequest> AddCommentAsync(string userId, string requestId, string commentText);

    Task<OnboardingRequest> DeleteRequestAsync(string requestId);

    object GetProjectMetadataByParatextId(string paratextId);

    object GetProjectMetadata(string? paratextId = null, string? scriptureForgeId = null);

    Task<string[]> GetCurrentlyAssignedUserIdsAsync();
}
