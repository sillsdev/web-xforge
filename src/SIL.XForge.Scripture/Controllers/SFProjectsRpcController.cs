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
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    [RpcRoute("projects")]
    public class SFProjectsRpcController : ProjectsRpcController<SFProjectEntity>
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

        protected override ProjectUserEntity CreateProjectUser(string userId)
        {
            return new SFProjectUserEntity
            {
                Id = ObjectId.GenerateNewId().ToString(),
                UserRef = userId,
                ProjectRef = ResourceId,
                Role = SFProjectRoles.SFReviewer
            };
        }

        protected override bool IsProjectSharingOptionEnabled(SFProjectEntity project, string option)
        {
            if (!project.CheckingConfig.Share.Enabled)
                return false;
            if (option == ShareOptions.Email)
                return project.CheckingConfig.Share.ViaEmail;
            return false;
        }
    }
}
