using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Utils;

namespace SIL.XForge.Services
{
    public class TestProjectService : ProjectService<TestProject, TestProjectSecret>
    {
        public TestProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IEmailService emailService, IRepository<TestProjectSecret> projectSecrets, ISecurityService securityService)
            : base(realtimeService, siteOptions, emailService, projectSecrets, securityService)
        {
        }

        protected override string ProjectAdminRole => TestProjectRoles.Administrator;

        protected override Task<Attempt<string>> TryGetProjectRoleAsync(TestProject project, string userId)
        {
            return Task.FromResult(Attempt.Success(TestProjectRoles.Reviewer));
        }
    }
}
