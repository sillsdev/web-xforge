using JsonApiDotNetCore.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SIL.XForge.Controllers;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    [Route(RootDataTypes.Projects)]
    public class SFProjectsController : ProjectsController
    {
        public SFProjectsController(IJsonApiContext jsonApiContext,
            IResourceService<SFProjectResource, string> resourceService, ILoggerFactory loggerFactory, IProjectService projectService)
            : base(jsonApiContext, projectService, loggerFactory)
        {
        }
    }
}
