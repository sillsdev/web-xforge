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

        /// <summary>Send an email to invite someone to work on the project</summary>
        public override async Task<IRpcMethodResult> Invite(string email)
        {
            SFProjectEntity project = await Projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            if (project == null)
                return InvalidParamsError();

            ShareConfig shareConfig = project.Share;
            if (shareConfig == null)
            {
                return ForbiddenError();
            }

            SiteOptions siteOptions = _siteOptions.Value;
            string url;
            if (shareConfig.Enabled && shareConfig.Level == ShareLevel.Anyone)
            {
                url = $"{siteOptions.Origin}projects/{ResourceId}?sharing=true";
            }
            else if (shareConfig.Enabled || IsUserProjectAdmin(project))
            {
                // Invite a specific person
                url = $"{siteOptions.Origin}projects/{ResourceId}?sharing=true&shareKey=bigsecret";
                await Projects.UpdateAsync(p => p.Id == ResourceId, update => update.Set(p => p.ShareKeys["bigsecret"], email));
            }
            else
            {
                return ForbiddenError();
            }

            UserEntity inviter = await Users.GetAsync(User.UserId);
            string subject = $"You've been invited to the project {project.ProjectName} on {siteOptions.Name}";
            string body = "<p>Hello </p><p></p>" +
                $"<p>{inviter.Name} invites you to join the {project.ProjectName} project on {siteOptions.Name}." +
                "</p><p></p>" +
                "<p>You're almost ready to start. Just click the link below to complete your signup and " +
                "then you will be ready to get started.</p><p></p>" +
                $"<p>To join, go to {url}</p><p></p>" +
                $"<p>Regards</p><p>    The {siteOptions.Name} team</p>";
            await _emailService.SendEmailAsync(email, subject, body);
            return Ok();
        }

        /// <summary>Add user to project, if sharing, optionally by a specific shareKey code from an email.</summary>
        public override async Task<IRpcMethodResult> CheckLinkSharing(string shareKey = null)
        {
            // TODO simplify detecting and returning ForbiddenError here and in above method.

            SFProjectEntity project = await Projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            if (project == null)
                return InvalidParamsError();

            ShareConfig shareConfig = project.Share;
            if (shareConfig == null || !shareConfig.Enabled)
            {
                return ForbiddenError();
            }
            if (shareConfig.Level == ShareLevel.Specific)
            {
                if (project.ShareKeys == null)
                {
                    return ForbiddenError();
                }
                if (!project.ShareKeys.ContainsKey(shareKey))
                {
                    return ForbiddenError();
                }
                var currentUserEmail = (await Users.GetAsync(User.UserId)).Email;
                if (project.ShareKeys[shareKey] == currentUserEmail)
                {
                    await AddUserToProject(project);
                    await Projects.UpdateAsync(p => p.Id == ResourceId, update => update.Unset(p => p.ShareKeys[shareKey]));
                    return Ok();
                }
            }

            if (shareConfig.Level != ShareLevel.Anyone && shareConfig.Level != ShareLevel.Specific)
            {
                return ForbiddenError();
            }

            await AddUserToProject(project);
            return Ok();
        }

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
    }
}
