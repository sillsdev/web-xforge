using System;
using System.IO;
using System.Threading.Tasks;
using JsonApiDotNetCore.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    public abstract class ProjectsController<T> : JsonApiControllerBase<T> where T : ProjectResource
    {
        private readonly IProjectService<T> _projectService;

        public ProjectsController(IJsonApiContext jsonApiContext, IProjectService<T> projectService,
            ILoggerFactory loggerFactory) : base(jsonApiContext, projectService, loggerFactory)
        {
            _projectService = projectService;
        }

        [HttpPost("{id}/audio")]
        [RequestSizeLimit(100_000_000)]
        public async Task<IActionResult> UploadAudioAsync(string id, [FromForm] IFormFile file)
        {
            using (Stream stream = file.OpenReadStream())
            {
                Uri uri = await _projectService.SaveAudioAsync(id, file.FileName, stream);
                return Created(uri.PathAndQuery, Path.GetFileName(uri.AbsolutePath));
            }
        }
    }
}
