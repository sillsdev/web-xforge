using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SIL.Machine.WebApi;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    [Route(MachineApi.Namespace)]
    [ApiController]
    [Authorize]
    public class MachineApiController : ControllerBase
    {
        private readonly IMachineApiService _machineApiService;
        private readonly IUserAccessor _userAccessor;

        public MachineApiController(
            IExceptionHandler exceptionHandler,
            IMachineApiService machineApiService,
            IUserAccessor userAccessor
        )
        {
            _machineApiService = machineApiService;
            _userAccessor = userAccessor;
            exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
        }

        [HttpGet(MachineApi.GetBuild)]
        public async Task<ActionResult<BuildDto>> GetBuildAsync(
            string projectId,
            [FromQuery] int? minRevision,
            CancellationToken cancellationToken
        )
        {
            try
            {
                BuildDto? build = await _machineApiService.GetBuildAsync(
                    _userAccessor.UserId,
                    projectId,
                    minRevision,
                    cancellationToken
                );

                // A null means no build is running
                if (build == null)
                {
                    return NoContent();
                }

                return Ok(build);
            }
            catch (DataNotFoundException)
            {
                return NotFound();
            }
            catch (ForbiddenException)
            {
                return Forbid();
            }
        }

        [HttpPost(MachineApi.GetWordGraph)]
        public async Task<ActionResult<BuildDto>> GetWordGraphAsync(
            string projectId,
            [FromBody] string[] segment,
            CancellationToken cancellationToken
        )
        {
            try
            {
                WordGraphDto wordGraph = await _machineApiService.GetWordGraphAsync(
                    _userAccessor.UserId,
                    projectId,
                    segment,
                    cancellationToken
                );
                return Ok(wordGraph);
            }
            catch (DataNotFoundException)
            {
                return NotFound();
            }
            catch (ForbiddenException)
            {
                return Forbid();
            }
        }

        [HttpPost(MachineApi.StartBuild)]
        public async Task<ActionResult<BuildDto>> StartBuildAsync(
            [FromBody] string projectId,
            CancellationToken cancellationToken
        )
        {
            try
            {
                BuildDto build = await _machineApiService.StartBuildAsync(
                    _userAccessor.UserId,
                    projectId,
                    cancellationToken
                );
                return Ok(build);
            }
            catch (DataNotFoundException)
            {
                return NotFound();
            }
            catch (ForbiddenException)
            {
                return Forbid();
            }
        }

        [HttpGet(MachineApi.GetEngine)]
        public async Task<ActionResult<EngineDto>> GetEngineAsync(string projectId, CancellationToken cancellationToken)
        {
            try
            {
                EngineDto engine = await _machineApiService.GetEngineAsync(
                    _userAccessor.UserId,
                    projectId,
                    cancellationToken
                );
                return Ok(engine);
            }
            catch (DataNotFoundException)
            {
                return NotFound();
            }
            catch (ForbiddenException)
            {
                return Forbid();
            }
        }
    }
}
