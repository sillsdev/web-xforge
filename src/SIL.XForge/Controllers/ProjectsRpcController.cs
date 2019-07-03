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
        protected readonly IEmailService _emailService;
        protected readonly IOptions<SiteOptions> _siteOptions;

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

        public virtual async Task<IRpcMethodResult> Invite(string email)
        {
            return ForbiddenError();
        }

        public virtual async Task<IRpcMethodResult> CheckLinkSharing()
        {
            return ForbiddenError();
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

        protected bool IsUserProjectAdmin(TEntity project)
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
