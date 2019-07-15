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
    public class SFProjectsController : ProjectsController<SFProjectResource>
    {
        public SFProjectsController(IJsonApiContext jsonApiContext, IProjectService<SFProjectResource> projectService,
            ILoggerFactory loggerFactory) : base(jsonApiContext, projectService, loggerFactory)
        {
        }
    }
}
