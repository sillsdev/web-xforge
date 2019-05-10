using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    public class TestProjectsRpcController : ProjectsRpcController<TestProjectEntity>
    {
        public TestProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<TestProjectEntity> projects, IRepository<UserEntity> users, IEmailService emailService,
            IOptions<SiteOptions> siteOptions)
            : base(userAccessor, httpRequestAccessor, projects, users, emailService, siteOptions)
        {
        }

        protected override ProjectUserEntity CreateProjectUser(string userId)
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

        protected override bool IsProjectSharingOptionEnabled(TestProjectEntity project, string option)
        {
            if (!project.CheckingConfig.Share.Enabled)
                return false;
            if (option == ShareOptions.Email)
                return project.CheckingConfig.Share.ViaEmail;
            return false;
        }
    }
}
