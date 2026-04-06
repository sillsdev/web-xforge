#nullable disable warnings
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class OnboardingRequestService(
    IRepository<OnboardingRequest> onboardingRequestRepository,
    IRealtimeService realtimeService,
    IServiceScopeFactory serviceScopeFactory
) : IOnboardingRequestService
{
    public async Task<string> SubmitOnboardingRequestAsync(
        string userId,
        string projectId,
        OnboardingRequestFormData formData,
        Uri siteRoot
    )
    {
        var request = new OnboardingRequest
        {
            Id = ObjectId.GenerateNewId().ToString(),
            Submission = new OnboardingSubmission
            {
                ProjectId = projectId,
                UserId = userId,
                Timestamp = DateTime.UtcNow,
                FormData = formData,
            },
            Resolution = "unresolved",
        };

        await onboardingRequestRepository.InsertAsync(request);

        SFProject projectDoc = await realtimeService.GetSnapshotAsync<SFProject>(projectId);

        _ = Task.Run(async () =>
        {
            using IServiceScope scope = serviceScopeFactory.CreateScope();
            await SendOnboardingRequestEmailsAsync(request, userId, projectDoc, siteRoot, scope);
            await SyncReferencedProjectsAsync(projectId, userId, formData, scope);
        });

        return request.Id;
    }

    public async Task<object> GetOpenOnboardingRequestAsync(string projectId)
    {
        OnboardingRequest existingRequest = await onboardingRequestRepository
            .Query()
            .FirstOrDefaultAsync(r => r.Submission.ProjectId == projectId);

        if (existingRequest == null)
        {
            return null;
        }

        User submittingUser = await realtimeService.GetSnapshotAsync<User>(existingRequest.Submission.UserId);

        return new
        {
            submittedAt = existingRequest.Submission.Timestamp,
            submittedBy = new { name = submittingUser.Name, email = submittingUser.Email },
            status = existingRequest.Status,
        };
    }

    public async Task<List<OnboardingRequest>> GetAllRequestsAsync() =>
        await onboardingRequestRepository.Query().OrderByDescending(r => r.Submission.Timestamp).ToListAsync();

    public async Task<OnboardingRequest> GetRequestByIdAsync(string requestId) =>
        await onboardingRequestRepository.Query().FirstOrDefaultAsync(r => r.Id == requestId);

    public async Task<OnboardingRequest> SetAssigneeAsync(string requestId, string assigneeId)
    {
        OnboardingRequest request = await onboardingRequestRepository
            .Query()
            .FirstOrDefaultAsync(r => r.Id == requestId);
        if (request == null)
        {
            return null;
        }

        request.AssigneeId = assigneeId ?? string.Empty;
        await onboardingRequestRepository.ReplaceAsync(request);
        return request;
    }

    public async Task<OnboardingRequest> SetResolutionAsync(string requestId, string? resolution)
    {
        OnboardingRequest request = await onboardingRequestRepository
            .Query()
            .FirstOrDefaultAsync(r => r.Id == requestId);
        if (request == null)
        {
            return null;
        }

        request.Resolution = resolution;
        await onboardingRequestRepository.ReplaceAsync(request);
        return request;
    }

    public async Task<OnboardingRequest> AddCommentAsync(string userId, string requestId, string commentText)
    {
        OnboardingRequest request = await onboardingRequestRepository
            .Query()
            .FirstOrDefaultAsync(r => r.Id == requestId);
        if (request == null)
        {
            return null;
        }

        var comment = new OnboardingRequestComment
        {
            Id = ObjectId.GenerateNewId().ToString(),
            UserId = userId,
            Text = commentText,
            DateCreated = DateTime.UtcNow,
        };

        request.Comments.Add(comment);
        await onboardingRequestRepository.ReplaceAsync(request);
        return request;
    }

    public async Task<OnboardingRequest> DeleteRequestAsync(string requestId) =>
        await onboardingRequestRepository.DeleteAsync(requestId);

    public object GetProjectMetadataByParatextId(string paratextId)
    {
        SFProject project = realtimeService.QuerySnapshots<SFProject>().FirstOrDefault(p => p.ParatextId == paratextId);
        if (project is null)
        {
            return null;
        }

        return new
        {
            ProjectId = project.Id,
            ProjectName = project.Name,
            ProjectShortName = project.ShortName,
        };
    }

    public object GetProjectMetadata(string? paratextId = null, string? scriptureForgeId = null)
    {
        bool hasParatextId = !string.IsNullOrEmpty(paratextId);
        bool hasScriptureForgeId = !string.IsNullOrEmpty(scriptureForgeId);
        if (hasParatextId == hasScriptureForgeId)
        {
            throw new InvalidOperationException("Provide exactly one of: paratextId or scriptureForgeId");
        }

        IQueryable<SFProject> projectQuery = realtimeService.QuerySnapshots<SFProject>();
        SFProject project = hasParatextId
            ? projectQuery.FirstOrDefault(p => p.ParatextId == paratextId)
            : projectQuery.FirstOrDefault(p => p.Id == scriptureForgeId);

        if (project is null)
        {
            return null;
        }

        return new
        {
            project.Id,
            project.ParatextId,
            project.Name,
            project.ShortName,
        };
    }

    public async Task<string[]> GetCurrentlyAssignedUserIdsAsync() =>
        [
            .. await onboardingRequestRepository
                .Query()
                .Where(r => !string.IsNullOrEmpty(r.AssigneeId))
                .Select(r => r.AssigneeId)
                .Distinct()
                .ToListAsync(),
        ];

    private static async Task SendOnboardingRequestEmailsAsync(
        OnboardingRequest request,
        string userId,
        SFProject projectDoc,
        Uri siteRoot,
        IServiceScope scope
    )
    {
        var scopedRealtimeService = scope.ServiceProvider.GetRequiredService<IRealtimeService>();
        var scopedUserService = scope.ServiceProvider.GetRequiredService<IUserService>();
        var scopedEmailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
        var scopedExceptionHandler = scope.ServiceProvider.GetRequiredService<IExceptionHandler>();
        var scopedOnboardingRequestService = scope.ServiceProvider.GetRequiredService<IOnboardingRequestService>();

        try
        {
            string[] adminUserIds = await scopedOnboardingRequestService.GetCurrentlyAssignedUserIdsAsync();

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
                SFProject existingProject = scopedRealtimeService
                    .QuerySnapshots<SFProject>()
                    .FirstOrDefault(p => p.ParatextId == paratextId);

                if (existingProject is null)
                {
                    string sourceProjectId = await scopedProjectService.CreateResourceProjectAsync(
                        userId,
                        paratextId,
                        addUser: true
                    );

                    await scopedProjectService.SyncAsync(userId, sourceProjectId);
                }
                else if (existingProject.Id == projectId)
                {
                    continue;
                }
                else if (existingProject.Sync.LastSyncSuccessful == false)
                {
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
}
