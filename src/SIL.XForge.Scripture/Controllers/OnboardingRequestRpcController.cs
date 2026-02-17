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
public class OnboardingRequestRpcController(
    IExceptionHandler exceptionHandler,
    IUserAccessor userAccessor,
    IRepository<OnboardingRequest> onboardingRequestRepository,
    IUserService userService,
    IRealtimeService realtimeService,
    ISFProjectService projectService,
    IEmailService emailService,
    IHttpRequestAccessor httpRequestAccessor
) : RpcControllerBase(userAccessor, exceptionHandler)
{
    private readonly IExceptionHandler _exceptionHandler = exceptionHandler;
    private readonly IRealtimeService _realtimeService = realtimeService;
    private readonly ISFProjectService _projectService = projectService;

    /// <summary>
    /// Submits a drafting signup request for the specified project.
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

            var request = new OnboardingRequest
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Submission = new OnboardingSubmission
                {
                    ProjectId = projectId,
                    UserId = UserId,
                    Timestamp = DateTime.UtcNow,
                    FormData = formData,
                },
                Resolution = "unresolved",
            };

            await onboardingRequestRepository.InsertAsync(request);

            // Email notification to Serval admins
            try
            {
                // Query for assignees in drafting signup requests, filter out duplicates, and then look up their email
                var adminUserIds = onboardingRequestRepository
                    .Query()
                    .Where(r => !string.IsNullOrEmpty(r.AssigneeId))
                    .Select(r => r.AssigneeId)
                    .Distinct()
                    .ToList();

                await using IConnection conn = await _realtimeService.ConnectAsync(UserId);
                var adminEmails = (await conn.GetAndFetchDocsAsync<User>(adminUserIds)).Select(u => u.Data.Email);

                // Send email to each admin using EmailService
                string userName = await userService.GetUsernameFromUserId(UserId, UserId);
                string subject = $"Onboarding request for {projectDoc.ShortName}";
                string link = $"{httpRequestAccessor.SiteRoot}/serval-administration/draft-requests/{request.Id}";
                string body =
                    $@"
                    <p>A new drafting signup request has been submitted for the project <strong>{projectDoc.ShortName} - {projectDoc.Name}</strong>.</p>
                    <p><strong>Submitted by:</strong> {userName}</p>
                    <p><strong>Submission Time:</strong> {request.Submission.Timestamp:u}</p>
                    <p>The request can be viewed at <a href=""{link}"">{link}</a></p>
                ";
                foreach (var email in adminEmails)
                {
                    await emailService.SendEmailAsync(email, subject, body);
                }
            }
            catch (Exception exception)
            {
                _exceptionHandler.RecordEndpointInfoForException(
                    new Dictionary<string, string>
                    {
                        { "method", "SubmitOnboardingRequest" },
                        { "projectId", projectId },
                        { "userId", UserId },
                    }
                );
                // report the exception without failing the whole request
                _exceptionHandler.ReportException(exception);
            }

            // Find all the paratext project ids in the sign up request
            // Start by collecting them into a set
            var paratextProjectIds = new List<string>
            {
                formData.sourceProjectA,
                formData.sourceProjectB,
                formData.sourceProjectC,
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
                    { "method", "SubmitOnboardingRequest" },
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

            var existingRequest = await onboardingRequestRepository
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
                    { "method", "GetOpenOnboardingRequest" },
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

            var requests = await onboardingRequestRepository
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
    /// Gets a drafting signup request by its ID. Only accessible to Serval admins.
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

            var request = await onboardingRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

            if (request == null)
            {
                return NotFoundError("Drafting signup request not found");
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

            var request = await onboardingRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

            if (request == null)
            {
                return NotFoundError("Drafting signup request not found");
            }

            // Update assignee
            request.AssigneeId = assigneeId ?? string.Empty;

            // Save changes
            await onboardingRequestRepository.ReplaceAsync(request);

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

            var request = await onboardingRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

            if (request == null)
            {
                return NotFoundError("Drafting signup request not found");
            }

            // Update resolution
            request.Resolution = resolution;

            // Save changes
            await onboardingRequestRepository.ReplaceAsync(request);

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

            var request = await onboardingRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

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
            await onboardingRequestRepository.ReplaceAsync(request);

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

            OnboardingRequest deletedRequest = await onboardingRequestRepository.DeleteAsync(requestId);

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

    /// <summary>
    /// Gets basic project metadata by Paratext ID. Only accessible to Serval admins.
    /// Note: This is intended for external use by the onboarding script, not internal Scripture Forge use.
    /// </summary>
    public async Task<IRpcMethodResult> GetProjectMetadataByParatextId(string paratextId)
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

            SFProject? project = _realtimeService
                .QuerySnapshots<SFProject>()
                .FirstOrDefault(p => p.ParatextId == paratextId);
            if (project is null)
            {
                return NotFoundError("Project not found");
            }

            object result = new
            {
                ProjectId = project.Id,
                ProjectName = project.Name,
                ProjectShortName = project.ShortName,
            };

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
}
