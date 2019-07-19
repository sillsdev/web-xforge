using System.Threading.Tasks;
using EdjCase.JsonRpc.Router;
using EdjCase.JsonRpc.Router.Abstractions;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    /// <summary>
    /// This controller contains project-related JSON-RPC commands that are common to all xForge applications.
    /// </summary>
    [RpcRoute(RootDataTypes.Projects)]
    public abstract class ProjectsRpcController<T> : RpcControllerBase where T : Project
    {
        internal const string AlreadyProjectMemberResponse = "alreadyProjectMember";

        protected ProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IProjectService<T> projectService) : base(userAccessor, httpRequestAccessor)
        {
            ProjectService = projectService;
        }

        protected IProjectService<T> ProjectService { get; }

        public async Task<IRpcMethodResult> Create(T project)
        {
            try
            {
                string projectId = await ProjectService.CreateProjectAsync(UserId, project);
                return Ok(projectId);
            }
            catch (ForbiddenException)
            {
                return ForbiddenError();
            }
        }

        public async Task<IRpcMethodResult> Delete()
        {
            try
            {
                await ProjectService.DeleteProjectAsync(UserId, ResourceId);
                return Ok();
            }
            catch (ForbiddenException)
            {
                return ForbiddenError();
            }
            catch (DataNotFoundException)
            {
                return InvalidParamsError();
            }
        }

        public async Task<IRpcMethodResult> AddUser(string projectRole)
        {
            try
            {
                await ProjectService.AddUserAsync(UserId, ResourceId, projectRole);
                return Ok();
            }
            catch (ForbiddenException)
            {
                return ForbiddenError();
            }
            catch (DataNotFoundException)
            {
                return InvalidParamsError();
            }
        }

        public async Task<IRpcMethodResult> RemoveUser(string projectUserId)
        {
            try
            {
                await ProjectService.RemoveUserAsync(UserId, ResourceId, projectUserId);
                return Ok();
            }
            catch (ForbiddenException)
            {
                return ForbiddenError();
            }
            catch (DataNotFoundException)
            {
                return InvalidParamsError();
            }
        }

        public async Task<IRpcMethodResult> Invite(string email)
        {
            try
            {
                if (await ProjectService.InviteAsync(UserId, ResourceId, email))
                    return Ok();
                return Ok(AlreadyProjectMemberResponse);
            }
            catch (ForbiddenException)
            {
                return ForbiddenError();
            }
            catch (DataNotFoundException)
            {
                return InvalidParamsError();
            }
        }

        public async Task<IRpcMethodResult> IsAlreadyInvited(string email)
        {
            try
            {
                return Ok(await ProjectService.IsAlreadyInvitedAsync(UserId, ResourceId, email));
            }
            catch (ForbiddenException)
            {
                return ForbiddenError();
            }
            catch (DataNotFoundException)
            {
                return InvalidParamsError();
            }
        }

        public async Task<IRpcMethodResult> CheckLinkSharing(string shareKey = null)
        {
            try
            {
                await ProjectService.CheckLinkSharingAsync(UserId, ResourceId, shareKey);
                return Ok();
            }
            catch (ForbiddenException)
            {
                return ForbiddenError();
            }
            catch (DataNotFoundException)
            {
                return InvalidParamsError();
            }
        }
    }
}
