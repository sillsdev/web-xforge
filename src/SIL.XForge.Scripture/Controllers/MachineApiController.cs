using System.Security;
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

        [HttpGet(MachineApi.GetEngine)]
        public async Task<ActionResult<MachineApiTranslationEngine>> GetEngineAsync(
            string projectId,
            CancellationToken cancellationToken
        )
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
                return NoContent();
            }
            catch (SecurityException)
            {
                return NoContent();
            }
        }
    }
}
