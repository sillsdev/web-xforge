using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Abstractions;
using SIL.XForge.Controllers;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    public class SFProjectsRpcController : ProjectsRpcController<SFProject>
    {
        private readonly ISFProjectService _projectService;

        public SFProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            ISFProjectService projectService) : base(userAccessor, httpRequestAccessor, projectService)
        {
            _projectService = projectService;
        }

        public async Task<IRpcMethodResult> UpdateTasks(UpdateTasksParams parameters)
        {
            try
            {
                await _projectService.UpdateTasksAsync(UserId, ResourceId, parameters);
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

        public async Task<IRpcMethodResult> AddTranslateMetrics(TranslateMetrics metrics)
        {
            try
            {
                await _projectService.AddTranslateMetricsAsync(UserId, ResourceId, metrics);
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

        public async Task<IRpcMethodResult> Sync()
        {
            try
            {
                await _projectService.SyncAsync(UserId, ResourceId);
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
