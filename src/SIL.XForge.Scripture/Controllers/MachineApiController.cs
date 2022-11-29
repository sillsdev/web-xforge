using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Polly.CircuitBreaker;
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
        private const string MachineApiUnavailable = "Machine API is unavailable";
        private readonly IExceptionHandler _exceptionHandler;
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
            _exceptionHandler = exceptionHandler;
            _exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
        }

        [HttpGet(MachineApi.GetBuild)]
        public async Task<ActionResult<BuildDto?>> GetBuildAsync(
            string projectId,
            string? buildId,
            [FromQuery] int? minRevision,
            CancellationToken cancellationToken
        )
        {
            try
            {
                BuildDto? build;
                try
                {
                    if (string.IsNullOrWhiteSpace(buildId))
                    {
                        build = await _machineApiService.GetCurrentBuildAsync(
                            _userAccessor.UserId,
                            projectId,
                            minRevision,
                            cancellationToken
                        );
                    }
                    else
                    {
                        build = await _machineApiService.GetBuildAsync(
                            _userAccessor.UserId,
                            projectId,
                            buildId,
                            minRevision,
                            cancellationToken
                        );
                    }
                }
                catch (DataNotFoundException)
                {
                    return NotFound();
                }

                // A null means no build is running
                if (build is null)
                {
                    return NoContent();
                }

                return Ok(build);
            }
            catch (BrokenCircuitException e)
            {
                _exceptionHandler.ReportException(e);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
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
            catch (BrokenCircuitException e)
            {
                _exceptionHandler.ReportException(e);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
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
        public async Task<ActionResult<WordGraphDto>> GetWordGraphAsync(
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
            catch (BrokenCircuitException e)
            {
                _exceptionHandler.ReportException(e);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
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
            catch (BrokenCircuitException e)
            {
                _exceptionHandler.ReportException(e);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
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

        [HttpPost(MachineApi.TrainSegment)]
        public async Task<ActionResult> TrainSegmentAsync(
            string projectId,
            [FromBody] SegmentPairDto segmentPair,
            CancellationToken cancellationToken
        )
        {
            try
            {
                await _machineApiService.TrainSegmentAsync(
                    _userAccessor.UserId,
                    projectId,
                    segmentPair,
                    cancellationToken
                );
                return Ok();
            }
            catch (BrokenCircuitException e)
            {
                _exceptionHandler.ReportException(e);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, MachineApiUnavailable);
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
