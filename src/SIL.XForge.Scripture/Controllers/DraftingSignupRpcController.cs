using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using MongoDB.Bson;
using SIL.XForge.Controllers;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// This controller handles drafting signup form submissions.
/// </summary>
public class DraftingSignupRpcController(
    IExceptionHandler exceptionHandler,
    IUserAccessor userAccessor,
    IRepository<DraftingSignupRequest> draftingSignupRequestRepository,
    IRealtimeService realtimeService,
    ISFProjectService projectService,
    IParatextService paratextService
) : RpcControllerBase(userAccessor, exceptionHandler)
{
    private readonly IExceptionHandler _exceptionHandler = exceptionHandler;
    private readonly IRealtimeService _realtimeService = realtimeService;
    private readonly ISFProjectService _projectService = projectService;
    private readonly IParatextService _paratextService = paratextService;

    public async Task<IRpcMethodResult> SubmitSignupRequest(string projectId, DraftingSignupFormData formData)
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

            var request = new DraftingSignupRequest
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Submission = new DraftingSignupSubmission
                {
                    ProjectId = projectId,
                    UserId = UserId,
                    Timestamp = DateTime.UtcNow,
                    FormData = formData,
                },
            };

            await draftingSignupRequestRepository.InsertAsync(request);

            // Find all the paratext project ids in the sign up request
            // Start by collecting them into a set
            var paratextProjectIds = new List<string>
            {
                formData.PrimarySourceProject,
                formData.SecondarySourceProject,
                formData.AdditionalSourceProject,
                formData.DraftingSourceProject,
                formData.BackTranslationProject,
            }
                .Where(id => !string.IsNullOrEmpty(id))
                .Distinct();

            // Connect each Paratext project that isn't already connected by creating resource projects
            foreach (string paratextId in paratextProjectIds)
            {
                // Check if project already exists
                SFProject existingProject = _realtimeService
                    .QuerySnapshots<SFProject>()
                    .FirstOrDefault(p => p.ParatextId == paratextId);

                if (existingProject is null)
                {
                    // Create the resource/source project and add the user to it
                    string sourceProjectId = await _projectService.CreateResourceProjectAsync(
                        UserId,
                        paratextId,
                        addUser: true
                    );

                    // Sync the newly created project to get its data
                    await _projectService.SyncAsync(UserId, sourceProjectId);
                }
                else if (existingProject.Id == projectId)
                {
                    // Verify that the source project is not the same as the target project
                    return InvalidParamsError("Source project cannot be the same as the target project");
                }
                else if (existingProject.Sync.LastSyncSuccessful == false)
                {
                    // If the project exists but last sync failed, retry the sync
                    await _projectService.SyncAsync(UserId, existingProject.Id);
                }
            }

            return Ok(request.Id);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SubmitSignupRequest" },
                    { "projectId", projectId },
                    { "userId", UserId },
                }
            );
            throw;
        }
    }

    /// <summary>
    /// Gets the existing signup request for the specified project, if any.
    /// Used to prevent multiple signups per project regardless of user.
    /// </summary>
    public async Task<IRpcMethodResult> GetOpenDraftSignupRequest(string projectId)
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

            var existingRequest = await draftingSignupRequestRepository
                .Query()
                .FirstOrDefaultAsync(r => r.Submission.ProjectId == projectId);

            if (existingRequest == null)
            {
                return Ok(null);
            }

            // Get user information for the person who submitted the request
            var submittingUser = await _realtimeService.GetSnapshotAsync<User>(existingRequest.Submission.UserId);

            var result = new
            {
                submittedAt = existingRequest.Submission.Timestamp,
                submittedBy = new { name = submittingUser.Name, email = submittingUser.Email },
                status = existingRequest.Status,
            };

            return Ok(result);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "GetOpenDraftSignupRequest" },
                    { "projectId", projectId },
                    { "userId", UserId },
                }
            );
            throw;
        }
    }

    /// <summary>
    /// Gets all drafting signup requests. Only accessible to Serval admins.
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

            var requests = await draftingSignupRequestRepository
                .Query()
                .OrderByDescending(r => r.Submission.Timestamp)
                .ToListAsync();

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
    /// Sets the assignee for a drafting signup request.
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

            var request = await draftingSignupRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

            if (request == null)
            {
                return NotFoundError("Drafting signup request not found");
            }

            // Update assignee
            request.AssigneeId = assigneeId ?? string.Empty;

            // Save changes
            await draftingSignupRequestRepository.ReplaceAsync(request);

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
    /// Sets the resolution for a drafting signup request.
    /// Only accessible to Serval admins.
    /// If resolution is set to a non-null value, the assignee is cleared.
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

            var request = await draftingSignupRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

            if (request == null)
            {
                return NotFoundError("Drafting signup request not found");
            }

            // Update resolution
            request.Resolution = resolution;

            // If marking with a resolution (non-null), clear the assignee
            if (!string.IsNullOrEmpty(resolution))
            {
                request.AssigneeId = string.Empty;
            }

            // Save changes
            await draftingSignupRequestRepository.ReplaceAsync(request);

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
    /// Adds a comment to a drafting signup request.
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

            var request = await draftingSignupRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

            if (request == null)
            {
                return NotFoundError("Drafting signup request not found");
            }

            // Create new comment
            var comment = new DraftRequestComment
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserId = UserId,
                Text = commentText,
                DateCreated = DateTime.UtcNow,
            };

            // Add comment to the request
            request.Comments.Add(comment);

            // Save changes
            await draftingSignupRequestRepository.ReplaceAsync(request);

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
    /// Deletes a drafting signup request from the database.
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

            DraftingSignupRequest deletedRequest = await draftingSignupRequestRepository.DeleteAsync(requestId);

            if (deletedRequest == null)
            {
                return NotFoundError("Drafting signup request not found");
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
}
