using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using EdjCase.JsonRpc.Core;
using EdjCase.JsonRpc.Router.Abstractions;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;


namespace SIL.XForge.Controllers
{
    /// <summary>
    /// This controller contains project-related JSON-RPC commands that are common to all xForge applications.
    /// </summary>
    public abstract class ProjectsRpcController<TEntity> : RpcControllerBase where TEntity : ProjectEntity
    {
        private readonly IEmailService _emailService;
        private readonly IOptions<SiteOptions> _siteOptions;

        protected ProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<TEntity> projects, IRepository<UserEntity> users, IEmailService emailService,
            IOptions<SiteOptions> siteOptions)
            : base(userAccessor, httpRequestAccessor)
        {
            Projects = projects;
            Users = users;
            _emailService = emailService;
            _siteOptions = siteOptions;
            SecurityUtils = new SecurityUtils();
        }

        protected IRepository<TEntity> Projects { get; }

        protected IRepository<UserEntity> Users { get; }

        protected abstract string ProjectAdminRole { get; }
        internal ISecurityUtils SecurityUtils { get; set; }

        /// <summary>Send an email to invite someone to work on the project</summary>
        public async Task<IRpcMethodResult> Invite(string email)
        {
            TEntity project = await Projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            if (project == null)
            {
                return InvalidParamsError();
            }

            // Does a current project-user already have this email?
            if ((await Projects.GetAsync(ResourceId)).Users
                .Select(pu => Users.GetAsync(pu.UserRef).Result.Email)
                .Any(puem => puem == email))
            {
                return Error((int)RpcErrorCode.InvalidParams, "Not inviting user who is already a member of this project");
            }

            SiteOptions siteOptions = _siteOptions.Value;
            string url;
            if (project.ShareEnabled && project.ShareLevel == SharingLevel.Anyone)
            {
                url = $"{siteOptions.Origin}projects/{ResourceId}?sharing=true";
            }
            else if (project.ShareEnabled || IsUserProjectAdmin(project))
            {
                // Invite a specific person
                // Reuse prior key, if any
                var key = (await Projects.GetAsync(ResourceId))
                    .ShareKeys.Where(sk => sk.Value == email).FirstOrDefault().Key
                    ?? SecurityUtils.GenerateKey();
                url = $"{siteOptions.Origin}projects/{ResourceId}?sharing=true&shareKey={key}";
                await Projects.UpdateAsync(p => p.Id == ResourceId, update => update.Set(p => p.ShareKeys[key], email));
            }
            else
            {
                return ForbiddenError();
            }

            UserEntity inviter = await Users.GetAsync(UserId);
            string subject = $"You've been invited to the project {project.ProjectName} on {siteOptions.Name}";
            string body = "<p>Hello </p><p></p>" +
                $"<p>{inviter.Name} invites you to join the {project.ProjectName} project on {siteOptions.Name}." +
                "</p><p></p>" +
                "<p>You're almost ready to start. Just click the link below to complete your signup and " +
                "then you will be ready to get started.</p><p></p>" +
                $"<p>To join, go to {url}<br />" +
                $"This link will only work for this email address.</p><p></p>" +
                $"<p>Regards,</p><p>The {siteOptions.Name} team</p>";
            await _emailService.SendEmailAsync(email, subject, body);
            return Ok();
        }

        /// <summary>Add user to project, if sharing, optionally by a specific shareKey code that was sent to the user by email.</summary>
        public async Task<IRpcMethodResult> CheckLinkSharing(string shareKey = null)
        {
            TEntity project = await Projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            if (project == null)
            {
                return InvalidParamsError();
            }

            if (!project.ShareEnabled)
            {
                return ForbiddenError();
            }

            if (project.ShareLevel != SharingLevel.Anyone && project.ShareLevel != SharingLevel.Specific)
            {
                return ForbiddenError();
            }

            if (project.ShareLevel == SharingLevel.Specific)
            {
                if (project.ShareKeys == null || !project.ShareKeys.ContainsKey(shareKey))
                {
                    return ForbiddenError();
                }
                var currentUserEmail = (await Users.GetAsync(UserId)).Email;
                if (project.ShareKeys[shareKey] == currentUserEmail)
                {
                    await AddUserToProject(project);
                    await Projects.UpdateAsync(p => p.Id == ResourceId, update => update.Unset(p => p.ShareKeys[shareKey]));
                    return Ok();
                }
            }

            await AddUserToProject(project);
            return Ok();
        }

        protected Task<bool> IsAuthorizedAsync()
        {
            return Projects.Query().AnyAsync(p => p.Id == ResourceId && p.Users.Any(pu => pu.UserRef == UserId));
        }

        protected virtual async Task<string> AddUserToProject(TEntity project)
        {
            ProjectUserEntity entity = CreateProjectUser(UserId);
            TEntity updatedProject = await Projects.UpdateAsync(
                p => p.Id == project.Id && !p.Users.Any(pu => pu.UserRef == UserId),
                update => update.Add(p => p.Users, entity));
            return updatedProject != null ? entity.Id : null;
        }

        private bool IsUserProjectAdmin(TEntity project)
        {
            // Is the user part of the project
            ProjectUserEntity projectUser = project.Users.FirstOrDefault(u => u.UserRef == UserId);
            if (projectUser != null)
            {
                if (projectUser.Role == ProjectAdminRole)
                    return true;
            }
            return false;
        }

        protected abstract ProjectUserEntity CreateProjectUser(string userId);
    }
}
