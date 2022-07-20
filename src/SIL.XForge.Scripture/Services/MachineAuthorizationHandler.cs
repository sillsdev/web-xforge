using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using SIL.Machine.WebApi.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class is responsible for authorizing access to Machine API endpoints.
    /// </summary>
    public class MachineAuthorizationHandler : IAuthorizationHandler
    {
        private readonly IRealtimeService _realtimeService;

        public MachineAuthorizationHandler(IRealtimeService realtimeService)
        {
            _realtimeService = realtimeService;
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
                Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(projectId);
                if (attempt.TryResult(out SFProject project))
                {
                    string userId = context.User.FindFirst(XFClaimTypes.UserId)?.Value;
                    if (
                        project.UserRoles.TryGetValue(userId, out string role)
                        && (role == SFProjectRole.Administrator || role == SFProjectRole.Translator)
                    )
                    {
                        List<IAuthorizationRequirement> pendingRequirements = context.PendingRequirements.ToList();
                        foreach (IAuthorizationRequirement requirement in pendingRequirements)
                            context.Succeed(requirement);
                    }
                }
            }
        }
    }
}
