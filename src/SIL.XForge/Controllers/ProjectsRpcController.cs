using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Web;
using JsonApiDotNetCore.Internal;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Http;
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
    public abstract class ProjectsRpcController<TEntity, TUserEntity> : RpcControllerBase where TEntity : ProjectEntity where TUserEntity : ProjectUserEntity
    {
        private readonly IRepository<TEntity> _projects;
        private readonly IRepository<UserEntity> _users;
        private readonly IEmailService _emailService;
        private readonly IOptions<SiteOptions> _siteOptions;

        protected ProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<TEntity> projects, IRepository<UserEntity> users, IEmailService emailService,
            IOptions<SiteOptions> siteOptions)
            : base(userAccessor, httpRequestAccessor)
        {
            _projects = projects;
            _users = users;
            _emailService = emailService;
            _siteOptions = siteOptions;
        }

        protected IRepository<TEntity> Projects
        {
            get { return _projects; }
        }

        protected abstract string ProjectAdminRole { get; }

        public async Task<string> Invite(string email)
        {
            // Check the user has permission to invite another user
            if (!await CheckCanInvite(ShareOptions.Email))
                throw ForbiddenException();

            if (await CreateInvitedUserAccount(email))
            {
                SiteOptions siteOptions = _siteOptions.Value;
                string projectName = await GetProjectName();
                string inviterName = User.Name;
                string url = $"{siteOptions.Origin}identity/sign-up?e={HttpUtility.UrlEncode(email)}";
                string subject = $"You've been invited to the project {projectName} on {siteOptions.Name}";
                string body = "<p>Hello </p><p></p>" +
                    $"<p>{inviterName} invites you to join the {projectName} project on {siteOptions.Name}." +
                    "</p><p></p>" +
                    "<p>You're almost ready to start. Just click the link below to complete your signup and " +
                    "then you will be ready to get started.</p><p></p>" +
                    $"<p>To join, go to {url}</p><p></p>" +
                    $"<p>Regards</p><p>    The {siteOptions.Name} team</p>";
                await _emailService.SendEmailAsync(email, subject, body);
                return "invited";
            }
            else
            {
                // user already exists
                string canonicalEmail = UserEntity.CanonicalizeEmail(email);
                UserEntity user = await _users.Query().FirstOrDefaultAsync(u => u.CanonicalEmail == canonicalEmail);
                bool isInProject = await _projects.Query()
                    .AnyAsync(p => p.Id == ResourceId && p.Users.Any(pu => pu.UserRef == user.Id));
                if (isInProject)
                {
                    return "none";
                }
                await AddUserToProject(user.Id);

                SiteOptions siteOptions = _siteOptions.Value;
                string projectName = await GetProjectName();
                string inviterName = User.Name;
                string subject = $"You've been added to the project {projectName} on {siteOptions.Name}";
                string body = "<p>Hello </p><p></p>" +
                    $"<p>{inviterName} has just added you to the {projectName} project on {siteOptions.Name}." +
                    "</p><p></p>" +
                    $"<p>Regards</p><p>    The {siteOptions.Name} team</p>";
                await _emailService.SendEmailAsync(email, subject, body);
                return "joined";
            }
        }

        protected Task<bool> IsAuthorizedAsync()
        {
            return _projects.Query().AnyAsync(p => p.Id == ResourceId && p.Users.Any(pu => pu.UserRef == User.UserId));
        }

        protected JsonApiException ForbiddenException()
        {
            return new JsonApiException(StatusCodes.Status403Forbidden,
                "The specified user does not have permission to perform this operation.");
        }

        private async Task<bool> CreateInvitedUserAccount(string email)
        {
            try
            {
                var user = new UserEntity
                {
                    Email = email,
                    CanonicalEmail = UserEntity.CanonicalizeEmail(email),
                    EmailVerified = false,
                    Role = SystemRoles.User,
                    ValidationKey = Security.GenerateKey(),
                    ValidationExpirationDate = DateTime.Now.AddDays(7),
                    Active = false,
                    Sites = new Dictionary<string, Site>
                    {
                        { _siteOptions.Value.Id, new Site() }
                    }
                };
                await _users.InsertAsync(user);
                user = await _users.Query().FirstOrDefaultAsync(u => u.Email == email);
                await AddUserToProject(user.Id);
                return true;
            }
            catch (DuplicateKeyException)
            {
                return false;
            }
        }

        private async Task<string> GetProjectName()
        {
            return (await _projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId))?.ProjectName;
        }


        private async Task AddUserToProject(string userId)
        {
            TUserEntity entity = CreateProjectUser(userId);
            await _projects.UpdateAsync(p => p.Id == ResourceId, update => update
                .Add(project => project.Users, entity)
            );
        }

        private async Task<bool> CheckCanInvite(string option)
        {
            ProjectEntity project = await _projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
            // Is the user part of the project
            ProjectUserEntity projectUser = project.Users.FirstOrDefault(u => u.UserRef == User.UserId);
            if (projectUser != null)
            {
                if (projectUser.Role == ProjectAdminRole)
                    return true;
                return await IsProjectSharingOptionEnabled(option);
            }
            return false;
        }

        protected abstract TUserEntity CreateProjectUser(string userId);
        protected abstract Task<bool> IsProjectSharingOptionEnabled(string option);
    }
}
