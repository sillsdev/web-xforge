using System.Linq;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Core;
using EdjCase.JsonRpc.Router;
using EdjCase.JsonRpc.Router.Abstractions;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using SIL.XForge.Configuration;
using SIL.XForge.Controllers;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Controllers
{
    [RpcRoute("projects")]
    public class SFProjectsRpcController : ProjectsRpcController<SFProjectEntity>
    {
        private readonly IRepository<TranslateMetrics> _translateMetrics;
        private readonly IParatextService _paratextService;

        public SFProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<SFProjectEntity> projects, IRepository<UserEntity> users, IEmailService emailService,
            IOptions<SiteOptions> siteOptions, IRepository<TranslateMetrics> translateMetrics,
            IParatextService paratextService)
            : base(userAccessor, httpRequestAccessor, projects, users, emailService, siteOptions)
        {
            _translateMetrics = translateMetrics;
            _paratextService = paratextService;
        }

        protected override string ProjectAdminRole => SFProjectRoles.Administrator;

        public async Task<IRpcMethodResult> AddTranslateMetrics(TranslateMetrics metrics)
        {
            if (!await IsAuthorizedAsync())
                return Error((int)RpcErrorCode.InvalidRequest, "Forbidden");

            metrics.UserRef = User.UserId;
            metrics.ProjectRef = ResourceId;
            await _translateMetrics.ReplaceAsync(metrics, true);
            return Ok();
        }

        protected override async Task<string> AddUserToProject(SFProjectEntity project)
        {
            string projectUserId = await base.AddUserToProject(project);
            if (projectUserId == null)
                return null;

            // check if the user is a Paratext user
            // if so, set the user's project role from the Paratext project
            UserEntity user = await Users.GetAsync(User.UserId);
            if (user.ParatextId != null)
            {
                Attempt<string> attempt = await _paratextService.TryGetProjectRoleAsync(user, project.ParatextId);
                if (attempt.TryResult(out string role))
                {
                    await Projects.UpdateAsync(p => p.Users.Any(pu => pu.Id == projectUserId),
                        update => update.Set(p => p.Users[ArrayPosition.FirstMatching].Role, role));
                }
            }
            return projectUserId;
        }

        protected override ProjectUserEntity CreateProjectUser(string userId)
        {
            return new SFProjectUserEntity
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserRef = userId,
                Role = SFProjectRoles.SFReviewer
            };
        }

        protected override bool TryGetShareConfig(SFProjectEntity project, out ShareConfig shareConfig)
        {
            if (!project.CheckingConfig.Enabled)
            {
                shareConfig = null;
                return false;
            }
            shareConfig = project.CheckingConfig.Share;
            return true;
        }
    }
}
