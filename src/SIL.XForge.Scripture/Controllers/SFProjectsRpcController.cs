using System.Threading.Tasks;
using System.Linq;
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
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    [RpcRoute("projects")]
    public class SFProjectsRpcController : ProjectsRpcController<SFProjectEntity, SFProjectUserEntity>
    {
        private readonly IRepository<TranslateMetrics> _translateMetrics;

        public SFProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<SFProjectEntity> projects, IRepository<UserEntity> users, IEmailService emailService,
            IOptions<SiteOptions> siteOptions, IRepository<TranslateMetrics> translateMetrics)
            : base(userAccessor, httpRequestAccessor, projects, users, emailService, siteOptions)
        {
            _translateMetrics = translateMetrics;
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

        protected override SFProjectUserEntity CreateProjectUser(string userId)
        {
            return new SFProjectUserEntity
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserRef = userId,
                ProjectRef = ResourceId,
                Role = SFProjectRoles.SFReviewer
            };
        }

        protected override async Task<bool> IsProjectSharingOptionEnabled(string option)
        {
            SFProjectEntity project = await Projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            if (!project.CheckingConfig.share.Enabled)
                return false;
            if (option == ShareOptions.Email)
                return project.CheckingConfig.share.ViaEmail;
            return false;
        }
    }
}
