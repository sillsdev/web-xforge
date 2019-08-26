using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using SIL.Machine.WebApi.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class is responsible for authorizing access to Machine API endpoints.
    /// </summary>
    public class MachineAuthorizationHandler : IAuthorizationHandler
    {
        private readonly ISFProjectService _projectService;

        public MachineAuthorizationHandler(ISFProjectService projectService)
        {
            _projectService = projectService;
        }

        public async Task HandleAsync(AuthorizationHandlerContext context)
        {
            string projectId = null;
            switch (context.Resource)
            {
                case Project project:
                    projectId = project.Id;
                    break;
                case Engine engine:
                    projectId = engine.Projects.First();
                    break;
            }
            if (projectId != null)
            {
                string userId = context.User.FindFirst(XFClaimTypes.UserId)?.Value;
                if (await _projectService.IsAuthorizedAsync(userId, projectId))
                {
                    List<IAuthorizationRequirement> pendingRequirements = context.PendingRequirements.ToList();
                    foreach (IAuthorizationRequirement requirement in pendingRequirements)
                        context.Succeed(requirement);
                }
            }
        }
    }
}
