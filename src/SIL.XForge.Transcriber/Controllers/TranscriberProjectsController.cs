using JsonApiDotNetCore.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SIL.XForge.Controllers;
using SIL.XForge.Transcriber.Models;

namespace SIL.XForge.Transcriber.Controllers
{
    [Route("projects")]
    public class TranscriberProjectsController : JsonApiControllerBase<TranscriberProjectResource>
    {
        public TranscriberProjectsController(IJsonApiContext jsonApiContext,
            IResourceService<TranscriberProjectResource, string> resourceService, ILoggerFactory loggerFactory)
            : base(jsonApiContext, resourceService, loggerFactory)
        {
        }
    }
}
