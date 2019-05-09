using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Web;
using JsonApiDotNetCore.Internal;
using MongoDB.Bson;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Http;
using EdjCase.JsonRpc.Router.Abstractions;
using EdjCase.JsonRpc.Core;
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
        private readonly IRepository<TEntity> _projects;
        private readonly IRepository<UserEntity> _users;
        private readonly IEmailService _emailService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private TEntity _project;

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

        protected TEntity Project
        {
            get { return _project; }
        }

        protected abstract string ProjectAdminRole { get; }

        public async Task<IRpcMethodResult> Invite(string email)
        {
            _project = await GetCurrentProject();
            // Check the user has permission to invite another user
            if (!CheckCanInvite(ShareOptions.Email))
                return ForbiddenError();

            if (await CreateInvitedUserAccount(email))
            {
                SiteOptions siteOptions = _siteOptions.Value;
                string projectName = _project.ProjectName;
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
                return Ok("invited");
            }
            else
            {
                // user already exists
                string canonicalEmail = UserEntity.CanonicalizeEmail(email);
                UserEntity user = await _users.Query().FirstOrDefaultAsync(u => u.CanonicalEmail == canonicalEmail);

                if (await AddUserToProject(user.Id) == null)
                    return Ok("none");

                SiteOptions siteOptions = _siteOptions.Value;
                string projectName = _project.ProjectName;
                string inviterName = User.Name;
                string subject = $"You've been added to the project {projectName} on {siteOptions.Name}";
                string body = "<p>Hello </p><p></p>" +
                    $"<p>{inviterName} has just added you to the {projectName} project on {siteOptions.Name}." +
                    "</p><p></p>" +
                    $"<p>Regards</p><p>    The {siteOptions.Name} team</p>";
                await _emailService.SendEmailAsync(email, subject, body);
                return Ok("joined");
            }
        }

        protected Task<bool> IsAuthorizedAsync()
        {
            return _projects.Query().AnyAsync(p => p.Id == ResourceId && p.Users.Any(pu => pu.UserRef == User.UserId));
        }

        protected IRpcMethodResult ForbiddenError()
        {
            return Error((int)RpcErrorCode.InvalidRequest,
                "The specified user does not have permission to perform this operation"
            );
        }

        private async Task<bool> CreateInvitedUserAccount(string email)
        {
            try
            {
                var user = new UserEntity
                {
                    Id = ObjectId.GenerateNewId().ToString(),
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
                await AddUserToProject(user.Id);
                return true;
            }
            catch (DuplicateKeyException)
            {
                return false;
            }
        }

        private async Task<TEntity> GetCurrentProject()
        {
            return await _projects.Query().FirstOrDefaultAsync(p => p.Id == ResourceId);
        }


        private async Task<TEntity> AddUserToProject(string userId)
        {
            ProjectUserEntity entity = CreateProjectUser(userId);
            return await _projects.UpdateAsync(p => p.Id == ResourceId && !p.Users.Any(pu => pu.UserRef == userId),
                update => update.Add(project => project.Users, entity)
            );
        }

        private bool CheckCanInvite(string option)
        {
            // Is the user part of the project
            ProjectUserEntity projectUser = _project.Users.FirstOrDefault(u => u.UserRef == User.UserId);
            if (projectUser != null)
            {
                if (projectUser.Role == ProjectAdminRole)
                    return true;
                return IsProjectSharingOptionEnabled(option);
            }
            return false;
        }

        protected abstract ProjectUserEntity CreateProjectUser(string userId);
        protected abstract bool IsProjectSharingOptionEnabled(string option);
    }
}
