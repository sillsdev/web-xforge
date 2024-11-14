using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using Hangfire;
using SIL.XForge.Controllers;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// This controller contains project-related JSON-RPC commands.
///
/// Many of the commands in this class could be moved to an abstract base class defined in <see cref="SIL.XForge"/>
/// assembly. Unfortunately, the <see cref="EdjCase.JsonRpc.Router"/> library does not support methods defined in
/// base classes.
/// </summary>
public class SFProjectsRpcController(
    IBackgroundJobClient backgroundJobClient,
    IExceptionHandler exceptionHandler,
    IHttpRequestAccessor httpRequestAccessor,
    ISFProjectService projectService,
    ITrainingDataService trainingDataService,
    IUserAccessor userAccessor
) : RpcControllerBase(userAccessor, exceptionHandler)
{
    internal const string AlreadyProjectMemberResponse = "alreadyProjectMember";

    // Keep a reference in this class to prevent duplicate allocation (Warning CS9107)
    private readonly IExceptionHandler _exceptionHandler = exceptionHandler;

    public async Task<IRpcMethodResult> Create(SFProjectCreateSettings settings)
    {
        try
        {
            string projectId = await projectService.CreateProjectAsync(UserId, settings);
            return Ok(projectId);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (InvalidOperationException e)
        {
            return InvalidParamsError(e.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "Create" },
                    { "ParatextId", settings?.ParatextId },
                    { "SourceParatextId", settings?.SourceParatextId },
                    { "CheckingEnabled", settings?.CheckingEnabled.ToString() }
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> CreateResourceProject(string paratextId)
    {
        try
        {
            string projectId = await projectService.CreateResourceProjectAsync(UserId, paratextId, addUser: true);
            return Ok(projectId);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (InvalidOperationException e)
        {
            return InvalidParamsError(e.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "CreateResourceProject" }, { "ParatextId", paratextId }, }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> Delete(string projectId)
    {
        try
        {
            await projectService.DeleteProjectAsync(UserId, projectId);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (InvalidOperationException e)
        {
            return InvalidParamsError(e.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "Delete" }, { "projectId", projectId }, }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> UpdateSettings(string projectId, SFProjectSettings settings)
    {
        try
        {
            await projectService.UpdateSettingsAsync(UserId, projectId, settings);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "UpdateSettings" },
                    { "projectId", projectId },
                    { "CheckingAnswerExport", settings?.CheckingAnswerExport },
                    { "SourceParatextId", settings?.SourceParatextId },
                    { "BiblicalTermsEnabled", settings?.BiblicalTermsEnabled?.ToString() },
                    { "AdditionalTrainingData", settings?.AdditionalTrainingData?.ToString() },
                    { "AlternateSourceParatextId", settings?.AlternateSourceParatextId },
                    { "AlternateTrainingSourceEnabled", settings?.AlternateTrainingSourceEnabled?.ToString() },
                    { "AlternateTrainingSourceParatextId", settings?.AlternateTrainingSourceParatextId },
                    { "AdditionalTrainingSourceEnabled", settings?.AdditionalTrainingSourceEnabled?.ToString() },
                    { "AdditionalTrainingSourceParatextId", settings?.AdditionalTrainingSourceParatextId },
                    { "CheckingEnabled", settings?.CheckingEnabled?.ToString() },
                    { "CheckingShareEnabled", settings?.CheckingShareEnabled?.ToString() },
                    { "TranslateShareEnabled", settings?.TranslateShareEnabled?.ToString() },
                    { "TranslationSuggestionsEnabled", settings?.TranslationSuggestionsEnabled?.ToString() },
                    { "UsersSeeEachOthersResponses", settings?.UsersSeeEachOthersResponses?.ToString() },
                    { "HideCommunityCheckingText", settings?.HideCommunityCheckingText?.ToString() },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> AddUser(string projectId, string projectRole)
    {
        try
        {
            await projectService.AddUserAsync(UserId, projectId, projectRole);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "AddUser" },
                    { "projectId", projectId },
                    { "projectRole", projectRole },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> AddUser(string projectId) => await this.AddUser(projectId, null);

    public async Task<IRpcMethodResult> RemoveUser(string projectId, string projectUserId)
    {
        try
        {
            await projectService.RemoveUserAsync(UserId, projectId, projectUserId);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "RemoveUser" },
                    { "projectId", projectId },
                    { "projectUserId", projectUserId },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> GetProjectRole(string projectId)
    {
        try
        {
            string role = await projectService.GetProjectRoleAsync(UserId, projectId);
            return Ok(role);
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "GetProjectRole" }, { "projectId", projectId }, }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> UpdateRole(string projectId, string userId, string projectRole)
    {
        try
        {
            await projectService.UpdateRoleAsync(UserId, SystemRoles, projectId, userId, projectRole);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "UpdateRole" },
                    { "projectId", projectId },
                    { "userId", userId },
                    { "projectRole", projectRole },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> Invite(string projectId, string email, string locale, string role)
    {
        try
        {
            if (await projectService.InviteAsync(UserId, projectId, email, locale, role, httpRequestAccessor.SiteRoot))
                return Ok();
            return Ok(AlreadyProjectMemberResponse);
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "Invite" },
                    { "projectId", projectId },
                    // Exclude email as it is PII
                    { "locale", locale },
                    { "role", role },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> UninviteUser(string projectId, string emailToUninvite)
    {
        try
        {
            await projectService.UninviteUserAsync(UserId, projectId, emailToUninvite);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "UninviteUser" }, { "projectId", projectId }, }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> IsAlreadyInvited(string projectId, string email)
    {
        try
        {
            return Ok(await projectService.IsAlreadyInvitedAsync(UserId, projectId, email));
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "IsAlreadyInvited" }, { "projectId", projectId }, }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> InvitedUsers(string projectId)
    {
        try
        {
            return Ok(await projectService.InvitedUsersAsync(UserId, projectId));
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "InvitedUsers" }, { "projectId", projectId }, }
            );
            throw;
        }
    }

    [Obsolete("Only here for old clients that still call it. Removed 2023-04.")]
    public async Task<IRpcMethodResult> CheckLinkSharing(string shareKey) => Ok(await JoinWithShareKey(shareKey));

    public async Task<IRpcMethodResult> JoinWithShareKey(string shareKey)
    {
        try
        {
            return Ok(await projectService.JoinWithShareKeyAsync(UserId, shareKey));
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "CheckLinkSharing" }, { "shareKey", shareKey }, }
            );
            throw;
        }
    }

    [Obsolete("New endpoints only require the share key. Old clients would still provide the projectId")]
    public async Task<IRpcMethodResult> CheckLinkSharing(string projectId, string shareKey) =>
        await CheckLinkSharing(shareKey);

    public IRpcMethodResult IsSourceProject(string projectId) => Ok(projectService.IsSourceProject(projectId));

    public async Task<IRpcMethodResult> LinkSharingKey(
        string projectId,
        string role,
        string shareLinkType,
        int daysBeforeExpiration
    )
    {
        try
        {
            return Ok(
                await projectService.GetLinkSharingKeyAsync(
                    UserId,
                    projectId,
                    role,
                    shareLinkType,
                    daysBeforeExpiration
                )
            );
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "LinkSharingKey" },
                    { "projectId", projectId },
                    { "role", role },
                    { "shareLinkType", shareLinkType },
                    { "daysBeforeExpiration", daysBeforeExpiration.ToString() }
                }
            );
            throw;
        }
    }

    [Obsolete(
        "New endpoints require the share link type. Old clients would only ever request a recipient link for email"
    )]
    public async Task<IRpcMethodResult> LinkSharingKey(string projectId, string role) =>
        await LinkSharingKey(projectId, role, ShareLinkType.Recipient, 14);

    public async Task<IRpcMethodResult> ReserveLinkSharingKey(string shareKey, int daysBeforeExpiration)
    {
        try
        {
            await projectService.ReserveLinkSharingKeyAsync(UserId, shareKey, daysBeforeExpiration);
            return Ok();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "ReserveLinkSharingKey" },
                    { "shareKey", shareKey },
                    { "daysBeforeExpiration", daysBeforeExpiration.ToString() }
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> AddTranslateMetrics(string projectId, TranslateMetrics metrics)
    {
        try
        {
            await projectService.AddTranslateMetricsAsync(UserId, projectId, metrics);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "AddTranslateMetrics" },
                    { "metricsId", metrics.Id },
                    { "projectId", projectId },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> Sync(string projectId)
    {
        try
        {
            await projectService.SyncAsync(UserId, projectId);
            return Ok();
        }
        catch (Exception ex) when (ex is ForbiddenException or UnauthorizedAccessException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "Sync" }, { "projectId", projectId }, }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> CancelSync(string projectId)
    {
        try
        {
            await projectService.CancelSyncAsync(UserId, projectId);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "CancelSync" }, { "projectId", projectId }, }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> DeleteAudio(string projectId, string ownerId, string dataId)
    {
        try
        {
            await projectService.DeleteAudioAsync(UserId, projectId, ownerId, dataId);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (FormatException fe)
        {
            return InvalidParamsError(fe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "DeleteAudio" },
                    { "projectId", projectId },
                    { "ownerId", ownerId },
                    { "dataId", dataId },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> DeleteTrainingData(string projectId, string ownerId, string dataId)
    {
        try
        {
            await trainingDataService.DeleteTrainingDataAsync(UserId, projectId, ownerId, dataId);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (FormatException fe)
        {
            return InvalidParamsError(fe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "DeleteTrainingData" },
                    { "projectId", projectId },
                    { "ownerId", ownerId },
                    { "dataId", dataId },
                }
            );
            throw;
        }
    }

    public IRpcMethodResult RetrievePreTranslationStatus(string projectId)
    {
        try
        {
            // Run the background job
            backgroundJobClient.Enqueue<MachineApiService>(r =>
                r.RetrievePreTranslationStatusAsync(projectId, CancellationToken.None)
            );
            return Ok();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "RetrievePreTranslationStatus" },
                    { "projectId", projectId },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> SetPreTranslate(string projectId, bool preTranslate)
    {
        try
        {
            await projectService.SetPreTranslateAsync(UserId, SystemRoles, projectId, preTranslate);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SetPreTranslate" },
                    { "projectId", projectId },
                    { "preTranslate", preTranslate.ToString() },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> SetSyncDisabled(string projectId, bool isDisabled)
    {
        try
        {
            await projectService.SetSyncDisabledAsync(UserId, SystemRoles, projectId, isDisabled);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SetSyncDisabled" },
                    { "projectId", projectId },
                    { "isDisabled", isDisabled.ToString() },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> SetServalConfig(string projectId, string? servalConfig)
    {
        try
        {
            await projectService.SetServalConfigAsync(UserId, SystemRoles, projectId, servalConfig);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SetServalConfig" },
                    { "projectId", projectId },
                    { "servalConfig", servalConfig },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> TransceleratorQuestions(string projectId)
    {
        try
        {
            return Ok(await projectService.TransceleratorQuestions(UserId, projectId));
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "TransceleratorQuestions" }, { "projectId", projectId }, }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> SetUserProjectPermissions(string projectId, string userId, string[] permissions)
    {
        try
        {
            await projectService.SetUserProjectPermissions(UserId, projectId, userId, permissions);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SetUserProjectPermissions" },
                    { "projectId", projectId },
                    { "userId", userId },
                    { "permissions", string.Join(',', permissions) },
                }
            );
            throw;
        }
    }

    // TODO (scripture audio) Add ability to update audio timing data and associated file URL
    public async Task<IRpcMethodResult> CreateAudioTimingData(
        string projectId,
        int book,
        int chapter,
        List<AudioTiming> timingData,
        string audioUrl
    )
    {
        try
        {
            await projectService.CreateAudioTimingData(UserId, projectId, book, chapter, timingData, audioUrl);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException dnfe)
        {
            return NotFoundError(dnfe.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "CreateAudioTimingData" },
                    { "projectId", projectId },
                    { "book", book.ToString() },
                    { "chapter", chapter.ToString() },
                    { "timingData", string.Join("\n", timingData) },
                    { "audioUrl", audioUrl },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> DeleteAudioTimingData(string projectId, int book, int chapter)
    {
        try
        {
            await projectService.DeleteAudioTimingData(UserId, projectId, book, chapter);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException)
        {
            return NotFoundError("Audio timing data not found");
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "DeleteAudioTimingData" },
                    { "projectId", projectId },
                    { "book", book.ToString() },
                    { "chapter", chapter.ToString() },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> SetDraftApplied(string projectId, int book, int chapter, bool draftApplied)
    {
        try
        {
            await projectService.SetDraftAppliedAsync(UserId, projectId, book, chapter, draftApplied);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException ex)
        {
            return NotFoundError(ex.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SetDraftApplied" },
                    { "projectId", projectId },
                    { "book", book.ToString() },
                    { "chapter", chapter.ToString() },
                    { "draftApplied", draftApplied.ToString() },
                }
            );
            throw;
        }
    }

    public async Task<IRpcMethodResult> SetIsValid(string projectId, int book, int chapter, bool isValid)
    {
        try
        {
            await projectService.SetIsValidAsync(UserId, projectId, book, chapter, isValid);
            return Ok();
        }
        catch (ForbiddenException)
        {
            return ForbiddenError();
        }
        catch (DataNotFoundException ex)
        {
            return NotFoundError(ex.Message);
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "SetIsValid" },
                    { "projectId", projectId },
                    { "book", book.ToString() },
                    { "chapter", chapter.ToString() },
                    { "isValid", isValid.ToString() },
                }
            );
            throw;
        }
    }
}
