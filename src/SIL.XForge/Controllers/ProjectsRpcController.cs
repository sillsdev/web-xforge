using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using EdjCase.JsonRpc.Router.Abstractions;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;

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
        }

        protected IRepository<TEntity> Projects { get; }

        protected IRepository<UserEntity> Users { get; }

        protected abstract string ProjectAdminRole { get; }

        public async Task<IRpcMethodResult> Invite(string email)
        {
            TEntity project = await Projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            if (project == null)
                return InvalidParamsError();

            SiteOptions siteOptions = _siteOptions.Value;
            string url;
            if (project.ShareEnabled && project.ShareLevel == SharingLevel.Anyone)
            {
                url = $"{siteOptions.Origin}projects/{ResourceId}?sharing=true";
            }
            else if (project.ShareEnabled || IsUserProjectAdmin(project))
            {
                // TODO: handle inviting a specific person here
                url = null;
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

        public async Task<IRpcMethodResult> CheckLinkSharing()
        {
            TEntity project = await Projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            if (project == null)
                return InvalidParamsError();

            if (!project.ShareEnabled || project.ShareLevel != SharingLevel.Anyone)
            {
                return ForbiddenError();
            }

            await AddUserToProject(project);
            return Ok();
        }

        protected Task<bool> IsAuthorizedAsync()
        {
            return Projects.Query().AnyAsync(p => p.Id == ResourceId && p.Users.Any(pu => pu.UserRef == User.UserId));
        }

        protected virtual async Task<string> AddUserToProject(TEntity project)
        {
            ProjectUserEntity entity = CreateProjectUser(User.UserId);
            TEntity updatedProject = await Projects.UpdateAsync(
                p => p.Id == project.Id && !p.Users.Any(pu => pu.UserRef == User.UserId),
                update => update.Add(p => p.Users, entity));
            return updatedProject != null ? entity.Id : null;
        }

        private bool IsUserProjectAdmin(TEntity project)
        {
            // Is the user part of the project
            ProjectUserEntity projectUser = project.Users.FirstOrDefault(u => u.UserRef == User.UserId);
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
