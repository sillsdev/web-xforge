using SIL.XForge.Controllers;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    public class SFProjectsController : ProjectsController<SFProject>
    {
        public SFProjectsController(IUserAccessor userAccessor, ISFProjectService projectService)
            : base(userAccessor, projectService)
        {
        }
    }
}
