using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    [Authorize]
    [Route(XForgeConstants.CommandApiNamespace + "/" + RootDataTypes.Projects)]
    public abstract class ProjectsController<T> : ControllerBase where T : Project
    {
        private readonly IUserAccessor _userAccessor;
        private readonly IProjectService<T> _projectService;

        public ProjectsController(IUserAccessor userAccessor, IProjectService<T> projectService)
        {
            _userAccessor = userAccessor;
            _projectService = projectService;
        }

        [HttpPost("{id}/audio")]
        [RequestSizeLimit(100_000_000)]
        public async Task<IActionResult> UploadAudioAsync(string id, [FromForm] IFormFile file)
        {
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
