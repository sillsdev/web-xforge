#nullable disable warnings
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using SIL.XForge.Controllers;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// This controller handles onboarding request form submissions.
/// </summary>
public class OnboardingRequestRpcController(
    IExceptionHandler exceptionHandler,
    IUserAccessor userAccessor,
    IRealtimeService realtimeService,
    IHttpRequestAccessor httpRequestAccessor,
    IOnboardingRequestService onboardingRequestService
) : RpcControllerBase(userAccessor, exceptionHandler)
{
    private readonly IExceptionHandler _exceptionHandler = exceptionHandler;
    private readonly IRealtimeService _realtimeService = realtimeService;

    /// <summary>
    /// Submits an onboarding request for the specified project.
    /// The user must be on the project and have a Paratext role.
    /// This stores the request, attempts to notify Serval admins by email, and connects any Paratext projects or DBL
    /// resources that were listed in the form that aren't already connected.
    /// </summary>
    public async Task<IRpcMethodResult> SubmitOnboardingRequest(string projectId, OnboardingRequestFormData formData)
    {
        try
        {
            // Verify user is on the project and has a Paratext role
            Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(projectId);
            if (!attempt.TryResult(out SFProject projectDoc))
            {
                return NotFoundError("Project not found");
            }

            if (!projectDoc.UserRoles.TryGetValue(UserId, out string role) || !SFProjectRole.IsParatextRole(role))
            {
                return ForbiddenError();
            }

            string requestId = await onboardingRequestService.SubmitOnboardingRequestAsync(
                UserId,
                projectId,
                formData,
                httpRequestAccessor.SiteRoot
            );

            return Ok(requestId);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SubmitOnboardingRequest" },
                    { "projectId", projectId },
                    { "userId", UserId },
                }
            );
            throw;
        }
    }

    /// <summary>
    /// Gets the existing onboarding request for the specified project, if any.
    /// Used to prevent multiple onboarding requests per project regardless of user.
    /// </summary>
    public async Task<IRpcMethodResult> GetOpenOnboardingRequest(string projectId)
    {
        try
        {
            // Verify user is on the project and has a Paratext role
            Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(projectId);
            if (!attempt.TryResult(out SFProject projectDoc))
            {
                return NotFoundError("Project not found");
            }

            if (!projectDoc.UserRoles.TryGetValue(UserId, out string role) || !SFProjectRole.IsParatextRole(role))
            {
                return ForbiddenError();
            }

            object result = await onboardingRequestService.GetOpenOnboardingRequestAsync(projectId);
            return Ok(result);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "GetOpenOnboardingRequest" },
                    { "projectId", projectId },
                    { "userId", UserId },
                }
            );
            throw;
        }
    }

    /// <summary>
    /// Gets all onboarding requests. Only accessible to Serval admins.
    /// </summary>
    public async Task<IRpcMethodResult> GetAllRequests()
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            List<OnboardingRequest> requests = await onboardingRequestService.GetAllRequestsAsync();
            return Ok(requests);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "GetAllRequests" } }
            );
            throw;
        }
    }

    /// <summary>
    /// Gets a onboarding request by its ID. Only accessible to Serval admins.
    /// </summary>
    public async Task<IRpcMethodResult> GetRequestById(string requestId)
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            OnboardingRequest request = await onboardingRequestService.GetRequestByIdAsync(requestId);

            if (request == null)
            {
                return NotFoundError("Onboarding request not found");
            }

            return Ok(request);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "GetRequestById" }, { "requestId", requestId } }
            );
            throw;
        }
    }

    /// <summary>
    /// Sets the assignee for a onboarding request.
    /// Only accessible to Serval admins.
    /// Status is calculated based on assignee and resolution.
    /// </summary>
    public async Task<IRpcMethodResult> SetAssignee(string requestId, string assigneeId)
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            OnboardingRequest request = await onboardingRequestService.SetAssigneeAsync(requestId, assigneeId);

            if (request == null)
            {
                return NotFoundError("Onboarding request not found");
            }

            return Ok(request);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SetAssignee" },
                    { "requestId", requestId },
                    { "assigneeId", assigneeId ?? "null" },
                }
            );
            throw;
        }
    }

    /// <summary>
    /// Sets the resolution for a onboarding request.
    /// Only accessible to Serval admins.
    /// Status is automatically calculated based on assignee and resolution.
    /// </summary>
    public async Task<IRpcMethodResult> SetResolution(string requestId, string? resolution)
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            OnboardingRequest request = await onboardingRequestService.SetResolutionAsync(requestId, resolution);

            if (request == null)
            {
                return NotFoundError("Onboarding request not found");
            }

            return Ok(request);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SetResolution" },
                    { "requestId", requestId },
                    { "resolution", resolution ?? "null" },
                }
            );
            throw;
        }
    }

    /// <summary>
    /// Adds a comment to an onboarding request.
    /// Only accessible to Serval admins.
    /// </summary>
    public async Task<IRpcMethodResult> AddComment(string requestId, string commentText)
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            OnboardingRequest request = await onboardingRequestService.AddCommentAsync(UserId, requestId, commentText);

            if (request == null)
            {
                return NotFoundError("Onboarding request not found");
            }

            return Ok(request);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "AddComment" }, { "requestId", requestId } }
            );
            throw;
        }
    }

    /// <summary>
    /// Deletes an onboarding request from the database.
    /// Only accessible to Serval admins.
    /// </summary>
    public async Task<IRpcMethodResult> DeleteRequest(string requestId)
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            OnboardingRequest deletedRequest = await onboardingRequestService.DeleteRequestAsync(requestId);

            if (deletedRequest == null)
            {
                return NotFoundError("Onboarding request not found");
            }

            return Ok(true);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "DeleteRequest" }, { "requestId", requestId } }
            );
            throw;
        }
    }

    /// <summary>
    /// Gets basic project metadata by Paratext ID. Only accessible to Serval admins.
    /// Note: This is intended for external use by the onboarding script, not internal Scripture Forge use.
    /// </summary>
    [Obsolete("Use GetProjectMetadata with either paratextId or scriptureForgeId instead for more flexible querying")]
    public IRpcMethodResult GetProjectMetadataByParatextId(string paratextId)
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            if (string.IsNullOrEmpty(paratextId))
            {
                return InvalidParamsError("Paratext ID is required");
            }

            object result = onboardingRequestService.GetProjectMetadataByParatextId(paratextId);
            if (result == null)
            {
                return NotFoundError("Project not found");
            }

            return Ok(result);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "GetProjectMetadataByParatextId" },
                    { "paratextId", paratextId },
                }
            );
            throw;
        }
    }

    /// <summary>
    /// Gets basic project metadata by Paratext ID or Scripture Forge project ID. Only accessible to Serval admins.
    /// Caller must provide exactly one identifier.
    /// Note: This is intended for external use by the onboarding script, not internal Scripture Forge use.
    /// </summary>
    public IRpcMethodResult GetProjectMetadata(string? paratextId = null, string? scriptureForgeId = null)
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            object result;
            try
            {
                result = onboardingRequestService.GetProjectMetadata(paratextId, scriptureForgeId);
            }
            catch (InvalidOperationException e)
            {
                return InvalidParamsError(e.Message);
            }

            if (result == null)
            {
                return NotFoundError("Project not found");
            }

            return Ok(result);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "GetProjectMetadata" },
                    { "paratextId", paratextId },
                    { "scriptureForgeId", scriptureForgeId },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> GetCurrentlyAssignedUserIds()
    {
        try
        {
            // Check if user is a Serval admin
            if (!SystemRoles.Contains(SystemRole.ServalAdmin))
            {
                return ForbiddenError();
            }

            string[] adminIds = await onboardingRequestService.GetCurrentlyAssignedUserIdsAsync();
            return Ok(adminIds);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "GetCurrentlyAssignedUserIds" } }
            );
            throw;
        }
    }
}
