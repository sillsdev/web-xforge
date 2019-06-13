using JsonApiDotNetCore.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SIL.XForge.Controllers;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Controllers
{
    [Route(RootDataTypes.ProjectUsers)]
    public class SFProjectUsersController : JsonApiControllerBase<SFProjectUserResource>
    {
        public SFProjectUsersController(IJsonApiContext jsonApiContext,
            IResourceService<SFProjectUserResource, string> resourceService, ILoggerFactory loggerFactory)
            : base(jsonApiContext, resourceService, loggerFactory)
        {
        }
    }
}
