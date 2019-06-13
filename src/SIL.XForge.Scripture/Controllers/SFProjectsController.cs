using JsonApiDotNetCore.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SIL.XForge.Controllers;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Controllers
{
    [Route(RootDataTypes.Projects)]
    public class SFProjectsController : JsonApiControllerBase<SFProjectResource>
    {
        public SFProjectsController(IJsonApiContext jsonApiContext,
            IResourceService<SFProjectResource, string> resourceService, ILoggerFactory loggerFactory)
            : base(jsonApiContext, resourceService, loggerFactory)
        {
        }
    }
}
