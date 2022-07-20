using System;
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

        private readonly ISFProjectService _projectService;

        public SFProjectsRpcController(IUserAccessor userAccessor, ISFProjectService projectService)
            : base(userAccessor)
        {
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
        }

        public async Task<IRpcMethodResult> CheckLinkSharing(string projectId, string shareKey)
        {
            try
            {
                await _projectService.CheckLinkSharingAsync(UserId, projectId, shareKey);
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
        }

        public async Task<IRpcMethodResult> CheckLinkSharing(string projectId)
        {
            return await CheckLinkSharing(projectId, null);
        }

        public IRpcMethodResult IsSourceProject(string projectId)
        {
            return Ok(_projectService.IsSourceProject(projectId));
        }

        public async Task<IRpcMethodResult> LinkSharingKey(string projectId, string role)
        {
            try
            {
                return Ok(await _projectService.GetLinkSharingKeyAsync(UserId, projectId, role));
            }
            catch (DataNotFoundException dnfe)
            {
                return NotFoundError(dnfe.Message);
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
        }
    }
}
