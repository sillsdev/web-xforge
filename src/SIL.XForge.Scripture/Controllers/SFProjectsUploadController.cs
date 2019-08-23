using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    /// <summary>
    /// This controller contains upload endpoints.
    /// </summary>
    [Authorize]
    [Route(UrlConstants.CommandApiNamespace + "/" + UrlConstants.Projects)]
    public class SFProjectsUploadController : ControllerBase
    {
        private readonly IUserAccessor _userAccessor;
        private readonly ISFProjectService _projectService;

        public SFProjectsUploadController(IUserAccessor userAccessor, ISFProjectService projectService)
        {
            _userAccessor = userAccessor;
            _projectService = projectService;
        }

        [HttpPost("audio")]
        [RequestSizeLimit(100_000_000)]
        public async Task<IActionResult> UploadAudioAsync([FromForm] string projectId, [FromForm] string dataId,
            [FromForm] IFormFile file)
        {
            try
            {
                using (Stream stream = file.OpenReadStream())
                {
                    Uri uri = await _projectService.SaveAudioAsync(_userAccessor.UserId, projectId, dataId,
                        Path.GetExtension(file.FileName), stream);
                    return Created(uri.PathAndQuery, Path.GetFileName(uri.AbsolutePath));
                }
            }
            catch (ForbiddenException)
            {
                return Forbid();
            }
            catch (DataNotFoundException)
            {
                return NotFound();
            }
            catch (FormatException)
            {
                return BadRequest();
            }
        }
    }
}
