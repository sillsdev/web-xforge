using JsonApiDotNetCore.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SIL.XForge.Controllers;
using SIL.XForge.Transcriber.Models;

namespace SIL.XForge.Transcriber.Controllers
{
    [Route("project-users")]
    public class TranscriberProjectUsersController : JsonApiControllerBase<TranscriberProjectUserResource>
    {
        public TranscriberProjectUsersController(IJsonApiContext jsonApiContext,
            IResourceService<TranscriberProjectUserResource, string> resourceService, ILoggerFactory loggerFactory)
            : base(jsonApiContext, resourceService, loggerFactory)
        {
        }
    }
}
