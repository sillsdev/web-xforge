#nullable disable warnings
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using Microsoft.Extensions.DependencyInjection;
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
/// This controller handles onboarding request form submissions.
/// </summary>
public class OnboardingRequestRpcController(
    IExceptionHandler exceptionHandler,
    IUserAccessor userAccessor,
    IRepository<OnboardingRequest> onboardingRequestRepository,
    IRealtimeService realtimeService,
    IHttpRequestAccessor httpRequestAccessor,
    IServiceScopeFactory serviceScopeFactory
) : RpcControllerBase(userAccessor, exceptionHandler)
{
    private readonly IExceptionHandler _exceptionHandler = exceptionHandler;
    private readonly IRealtimeService _realtimeService = realtimeService;
    private readonly IServiceScopeFactory _serviceScopeFactory = serviceScopeFactory;

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

            string submittingUserId = UserId;
            Uri siteRoot = httpRequestAccessor.SiteRoot;

            var request = new OnboardingRequest
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Submission = new OnboardingSubmission
                {
                    ProjectId = projectId,
                    UserId = submittingUserId,
                    Timestamp = DateTime.UtcNow,
                    FormData = formData,
                },
                Resolution = "unresolved",
            };

            await onboardingRequestRepository.InsertAsync(request);

            _ = Task.Run(async () =>
            {
                using IServiceScope scope = _serviceScopeFactory.CreateScope();
                await SendOnboardingRequestEmailsAsync(request, submittingUserId, projectDoc, siteRoot, scope);
                await SyncReferencedProjectsAsync(projectId, submittingUserId, formData, scope);
            });

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

    private static async Task SendOnboardingRequestEmailsAsync(
        OnboardingRequest request,
        string userId,
        SFProject projectDoc,
        Uri siteRoot,
        IServiceScope scope
    )
    {
        var scopedOnboardingRequestRepository = scope.ServiceProvider.GetRequiredService<
            IRepository<OnboardingRequest>
        >();
        var scopedRealtimeService = scope.ServiceProvider.GetRequiredService<IRealtimeService>();
        var scopedUserService = scope.ServiceProvider.GetRequiredService<IUserService>();
        var scopedEmailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
        var scopedExceptionHandler = scope.ServiceProvider.GetRequiredService<IExceptionHandler>();

        try
        {
            var adminUserIds = scopedOnboardingRequestRepository
                .Query()
                .Where(r => !string.IsNullOrEmpty(r.AssigneeId))
                .Select(r => r.AssigneeId)
                .Distinct()
                .ToList();

            await using IConnection conn = await scopedRealtimeService.ConnectAsync();
            var adminEmails = (await conn.GetAndFetchDocsAsync<User>(adminUserIds)).Select(u => u.Data.Email);

            string userName = await scopedUserService.GetUsernameFromUserId(userId, userId);
            string subject = $"Onboarding request for {projectDoc.ShortName}";
            string link = $"{siteRoot}/serval-administration/onboarding-requests/{request.Id}";
            string body =
                $@"
                    <p>A new onboarding request has been submitted for the project <strong>{projectDoc.ShortName} - {projectDoc.Name}</strong>.</p>
                    <p><strong>Submitted by:</strong> {userName}</p>
                    <p><strong>Submission Time:</strong> {request.Submission.Timestamp:u}</p>
                    <p>The request can be viewed at <a href=""{link}"">{link}</a></p>
                ";
            foreach (string email in adminEmails)
            {
                await scopedEmailService.SendEmailAsync(email, subject, body);
            }
        }
        catch (Exception exception)
        {
            scopedExceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SendOnboardingRequestEmailsAsync" },
                    { "userId", userId },
                    { "requestId", request.Id },
                }
            );
            scopedExceptionHandler.ReportException(exception);
        }
    }

    private static async Task SyncReferencedProjectsAsync(
        string projectId,
        string userId,
        OnboardingRequestFormData formData,
        IServiceScope scope
    )
    {
        var scopedRealtimeService = scope.ServiceProvider.GetRequiredService<IRealtimeService>();
        var scopedProjectService = scope.ServiceProvider.GetRequiredService<ISFProjectService>();
        var scopedExceptionHandler = scope.ServiceProvider.GetRequiredService<IExceptionHandler>();

        try
        {
            // Find all the paratext project ids in the sign up request.
            List<string> paratextProjectIds =
            [
                .. new List<string>
                {
                    formData.sourceProjectA,
                    formData.sourceProjectB,
                    formData.sourceProjectC,
                    formData.DraftingSourceProject,
                    formData.BackTranslationProject,
                }
                    .Where(id => !string.IsNullOrEmpty(id))
                    .Distinct(),
            ];

            foreach (string paratextId in paratextProjectIds)
            {
                // Check if project already exists
                SFProject existingProject = scopedRealtimeService
                    .QuerySnapshots<SFProject>()
                    .FirstOrDefault(p => p.ParatextId == paratextId);

                if (existingProject is null)
                {
                    // Create the resource/source project and add the user to it
                    string sourceProjectId = await scopedProjectService.CreateResourceProjectAsync(
                        userId,
                        paratextId,
                        addUser: true
                    );

                    // Sync the newly created project to get its data
                    await scopedProjectService.SyncAsync(userId, sourceProjectId);
                }
                else if (existingProject.Id == projectId)
                {
                    // Skip syncing if the source project is the same as the target project.
                    continue;
                }
                else if (existingProject.Sync.LastSyncSuccessful == false)
                {
                    // If the project exists but last sync failed, retry the sync
                    await scopedProjectService.SyncAsync(userId, existingProject.Id);
                }
            }
        }
        catch (Exception exception)
        {
            scopedExceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SyncReferencedProjectsAsync" },
                    { "projectId", projectId },
                    { "userId", userId },
                }
            );
            scopedExceptionHandler.ReportException(exception);
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

            var request = await onboardingRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

            if (request == null)
            {
                return NotFoundError("Onboarding request not found");
            }

            // Create new comment
            var comment = new OnboardingRequestComment
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

            OnboardingRequest deletedRequest = await onboardingRequestRepository.DeleteAsync(requestId);

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

            bool hasParatextId = !string.IsNullOrEmpty(paratextId);
            bool hasScriptureForgeId = !string.IsNullOrEmpty(scriptureForgeId);
            if (hasParatextId == hasScriptureForgeId)
            {
                return InvalidParamsError("Provide exactly one of: paratextId or scriptureForgeId");
            }

            IQueryable<SFProject> projectQuery = _realtimeService.QuerySnapshots<SFProject>();
            SFProject? project;

            project = hasParatextId
                ? projectQuery.FirstOrDefault(p => p.ParatextId == paratextId)
                : projectQuery.FirstOrDefault(p => p.Id == scriptureForgeId);

            if (project is null)
            {
                return NotFoundError("Project not found");
            }

            object result = new
            {
                project.Id,
                project.ParatextId,
                project.Name,
                project.ShortName,
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
                    { "method", "GetProjectMetadata" },
                    { "paratextId", paratextId },
                    { "scriptureForgeId", scriptureForgeId },
                }
            );
            throw;
        }
    }
}
