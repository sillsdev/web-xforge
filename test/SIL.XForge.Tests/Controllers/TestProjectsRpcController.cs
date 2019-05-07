using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    public class TestProjectsRpcController : ProjectsRpcController<TestProjectEntity, TestProjectUserEntity>
    {
        public TestProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<TestProjectEntity> projects, IRepository<UserEntity> users, IEmailService emailService,
            IOptions<SiteOptions> siteOptions)
            : base(userAccessor, httpRequestAccessor, projects, users, emailService, siteOptions)
        {
        }

        protected override TestProjectUserEntity CreateProjectUser(string userId)
        {
            return new TestProjectUserEntity
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserRef = userId,
                ProjectRef = ResourceId,
                Role = TestProjectRoles.Reviewer
            };
        }

        protected override string ProjectAdminRole => TestProjectRoles.Administrator;

        protected override async Task<bool> IsProjectSharingOptionEnabled(string option)
        {
            TestProjectEntity project = await Projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            if (!project.CheckingConfig.share.Enabled)
                return false;
            if (option == ShareOptions.Email)
                return project.CheckingConfig.share.ViaEmail;
            return false;
        }
    }
}
