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
    [RpcRoute(RootDataTypes.Projects)]
    public class SFProjectsRpcController : ProjectsRpcController<SFProjectEntity>
    {
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<TranslateMetrics> _translateMetrics;
        private readonly IParatextService _paratextService;
        private readonly ISyncService _syncService;

        public SFProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<SFProjectEntity> projects, IReadOnlyRepository<User> users, IEmailService emailService,
            IOptions<SiteOptions> siteOptions, IRepository<UserSecret> userSecrets,
            IRepository<TranslateMetrics> translateMetrics, IParatextService paratextService, ISyncService syncService)
            : base(userAccessor, httpRequestAccessor, projects, users, emailService, siteOptions)
        {
            _userSecrets = userSecrets;
            _translateMetrics = translateMetrics;
            _paratextService = paratextService;
            _syncService = syncService;
        }

        protected override string ProjectAdminRole => SFProjectRoles.Administrator;

        public async Task<IRpcMethodResult> AddTranslateMetrics(TranslateMetrics metrics)
        {
            if (!await IsAuthorizedAsync())
                return Error((int)RpcErrorCode.InvalidRequest, "Forbidden");

            metrics.UserRef = UserId;
            metrics.ProjectRef = ResourceId;
            await _translateMetrics.ReplaceAsync(metrics, true);
            return Ok();
        }

        public async Task<IRpcMethodResult> Sync()
        {
            bool authorized = await Projects.Query().AnyAsync(p => p.Id == ResourceId
                && p.Users.Any(pu => pu.UserRef == UserId && pu.Role == SFProjectRoles.Administrator));
            if (!authorized)
                return Error((int)RpcErrorCode.InvalidRequest, "Forbidden");

            await _syncService.SyncAsync(ResourceId, UserId, false);
            return Ok();
        }

        protected override async Task<string> AddUserToProject(SFProjectEntity project)
        {
            string projectUserId = await base.AddUserToProject(project);
            if (projectUserId == null)
                return null;

            // check if the user is a Paratext user
            // if so, set the user's project role from the Paratext project
            Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(UserId);
            if (userSecretAttempt.TryResult(out UserSecret userSecret))
            {
                Attempt<string> roleAttempt = await _paratextService.TryGetProjectRoleAsync(userSecret,
                    project.ParatextId);
                if (roleAttempt.TryResult(out string role))
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
    }
}
