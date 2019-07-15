using System.Collections.Generic;
using System.Security;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Controllers
{
    [Route("paratext-api")]
    [ApiController]
    [Authorize]
    public class ParatextController : ControllerBase
    {
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IParatextService _paratextService;
        private readonly IUserAccessor _userAccessor;

        public ParatextController(IRepository<UserSecret> userSecrets, IParatextService paratextService,
            IUserAccessor userAccessor)
        {
            _userSecrets = userSecrets;
            _paratextService = paratextService;
            _userAccessor = userAccessor;
        }

        [HttpGet("projects")]
        public async Task<ActionResult<IEnumerable<ParatextProject>>> GetAsync()
        {
            Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(_userAccessor.UserId);
            if (!attempt.TryResult(out UserSecret userSecret))
                return NoContent();

            try
            {
                IReadOnlyList<ParatextProject> projects = await _paratextService.GetProjectsAsync(userSecret);
                return Ok(projects);
            }
            catch (SecurityException)
            {
                return NoContent();
            }
        }

        [HttpGet("username")]
        public async Task<ActionResult<string>> UsernameAsync()
        {
            Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(_userAccessor.UserId);
            if (!attempt.TryResult(out UserSecret userSecret))
                return NoContent();
            string username = _paratextService.GetParatextUsername(userSecret);
            return Ok(username);
        }
    }
}
