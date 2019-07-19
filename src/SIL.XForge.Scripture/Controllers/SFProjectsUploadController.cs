using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    /// <summary>
    /// This controller contains upload endpoints.
    /// </summary>
    [Authorize]
    [Route(ControllerConstants.CommandApiNamespace + "/" + RootDataTypes.Projects)]
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
        public async Task<IActionResult> UploadAudioAsync([FromForm] string id, [FromForm] IFormFile file)
        {
            if (file.FileName.IndexOfAny(Path.GetInvalidFileNameChars()) != -1)
                return BadRequest();

            if (!await _projectService.IsAuthorizedAsync(id, _userAccessor.UserId))
                return Forbid();

            using (Stream stream = file.OpenReadStream())
            {
                Uri uri = await _projectService.SaveAudioAsync(id, file.FileName, stream);
                return Created(uri.PathAndQuery, Path.GetFileName(uri.AbsolutePath));
            }
        }
    }
}
