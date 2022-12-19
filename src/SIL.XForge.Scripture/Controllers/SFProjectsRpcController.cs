using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using SIL.XForge.Controllers;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    /// <summary>
    /// This controller contains project-related JSON-RPC commands.
    ///
    /// Many of the commands in this class could be moved to an abstract base class defined in <see cref="SIL.XForge"/>
    /// assembly. Unfortunately, the <see cref="EdjCase.JsonRpc.Router"/> library does not support methods defined in
    /// base classes.
    /// </summary>
    public class SFProjectsRpcController : RpcControllerBase
    {
        internal const string AlreadyProjectMemberResponse = "alreadyProjectMember";

        private readonly IExceptionHandler _exceptionHandler;
        private readonly ISFProjectService _projectService;

        public SFProjectsRpcController(
            IUserAccessor userAccessor,
            ISFProjectService projectService,
            IExceptionHandler exceptionHandler
        ) : base(userAccessor, exceptionHandler)
        {
            _exceptionHandler = exceptionHandler;
            _projectService = projectService;
        }

        public async Task<IRpcMethodResult> Create(SFProjectCreateSettings settings)
        {
            try
            {
                string projectId = await _projectService.CreateProjectAsync(UserId, settings);
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
                        { "CheckingEnabled", settings?.CheckingEnabled.ToString() },
                        { "TranslationSuggestionsEnabled", settings?.TranslationSuggestionsEnabled.ToString() },
                    }
                );
                throw;
            }
        }

        public async Task<IRpcMethodResult> Delete(string projectId)
        {
            try
            {
                await _projectService.DeleteProjectAsync(UserId, projectId);
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
                    new Dictionary<string, string> { { "method", "Delete" }, { "projectId", projectId }, }
                );
                throw;
            }
        }

        public async Task<IRpcMethodResult> UpdateSettings(string projectId, SFProjectSettings settings)
        {
            try
            {
                await _projectService.UpdateSettingsAsync(UserId, projectId, settings);
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
                        { "CheckingEnabled", settings?.CheckingEnabled?.ToString() },
                        { "CheckingShareEnabled", settings?.CheckingShareEnabled?.ToString() },
                        { "TranslateShareEnabled", settings?.TranslateShareEnabled?.ToString() },
                        { "TranslationSuggestionsEnabled", settings?.TranslationSuggestionsEnabled?.ToString() },
                        { "UsersSeeEachOthersResponses", settings?.UsersSeeEachOthersResponses?.ToString() },
                    }
                );
                throw;
            }
        }

        public async Task<IRpcMethodResult> AddUser(string projectId, string projectRole)
        {
            try
            {
                await _projectService.AddUserAsync(UserId, projectId, projectRole);
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

        public async Task<IRpcMethodResult> AddUser(string projectId)
        {
            return await this.AddUser(projectId, null);
        }

        public async Task<IRpcMethodResult> RemoveUser(string projectId, string projectUserId)
        {
            try
            {
                await _projectService.RemoveUserAsync(UserId, projectId, projectUserId);
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
                string role = await _projectService.GetProjectRoleAsync(UserId, projectId);
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

        public async Task<IRpcMethodResult> UpdateRole(string projectId, string projectRole)
        {
            try
            {
                await _projectService.UpdateRoleAsync(UserId, SystemRole, projectId, projectRole);
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
                if (await _projectService.InviteAsync(UserId, projectId, email, locale, role))
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
                await _projectService.UninviteUserAsync(UserId, projectId, emailToUninvite);
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
                return Ok(await _projectService.IsAlreadyInvitedAsync(UserId, projectId, email));
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
                return Ok(await _projectService.InvitedUsersAsync(UserId, projectId));
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

        public async Task<IRpcMethodResult> CheckLinkSharing(string shareKey)
        {
            try
            {
                return Ok(await _projectService.CheckLinkSharingAsync(UserId, shareKey));
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

        public IRpcMethodResult IsSourceProject(string projectId)
        {
            return Ok(_projectService.IsSourceProject(projectId));
        }

        public async Task<IRpcMethodResult> LinkSharingKey(string projectId, string role, string shareLinkType)
        {
            try
            {
                return Ok(await _projectService.GetLinkSharingKeyAsync(UserId, projectId, role, shareLinkType));
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
                    }
                );
                throw;
            }
        }

        public async Task<IRpcMethodResult> AddTranslateMetrics(string projectId, TranslateMetrics metrics)
        {
            try
            {
                await _projectService.AddTranslateMetricsAsync(UserId, projectId, metrics);
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
                await _projectService.SyncAsync(UserId, projectId);
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
                    new Dictionary<string, string> { { "method", "Sync" }, { "projectId", projectId }, }
                );
                throw;
            }
        }

        public async Task<IRpcMethodResult> CancelSync(string projectId)
        {
            try
            {
                await _projectService.CancelSyncAsync(UserId, projectId);
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
                await _projectService.DeleteAudioAsync(UserId, projectId, ownerId, dataId);
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

        public async Task<IRpcMethodResult> SetSyncDisabled(string projectId, bool isDisabled)
        {
            try
            {
                await _projectService.SetSyncDisabledAsync(UserId, SystemRole, projectId, isDisabled);
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

        public async Task<IRpcMethodResult> TransceleratorQuestions(string projectId)
        {
            try
            {
                return Ok(await _projectService.TransceleratorQuestions(UserId, projectId));
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
                        { "method", "TransceleratorQuestions" },
                        { "projectId", projectId },
                    }
                );
                throw;
            }
        }

        public async Task<IRpcMethodResult> SetUserProjectPermissions(
            string projectId,
            string userId,
            string[] permissions
        )
        {
            try
            {
                await _projectService.SetUserProjectPermissions(UserId, projectId, userId, permissions);
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
    }
}
