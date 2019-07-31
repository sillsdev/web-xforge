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
        private readonly IReadOnlyRepository<User> _users;
        private readonly IOptions<SiteOptions> _siteOptions;

        protected ProjectsRpcController(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor,
            IRepository<TEntity> projects, IReadOnlyRepository<User> users, IEmailService emailService,
            IOptions<SiteOptions> siteOptions) : base(userAccessor, httpRequestAccessor)
        {
            Projects = projects;
            _users = users;
            _emailService = emailService;
            _siteOptions = siteOptions;
            SecurityUtils = new SecurityUtils();
        }

        /// <summary>Indication that the user is already a member of this project, and so will not be sent an email to be invited.</summary>
        public static string AlreadyProjectMemberResponse => "alreadyProjectMember";
        protected IRepository<TEntity> Projects { get; }
        protected abstract string ProjectAdminRole { get; }
        internal ISecurityUtils SecurityUtils { get; set; }

        /// <summary>Encode the input so it is easier to use as a JSON object
        /// name using our libraries. Replaces dot characters. A proper encoder
        /// would do much more (https://json.org/).</summary>
        public static string EncodeJsonName(string name)
        {
            if (name == null)
            {
                return null;
            }
            return name.Replace(".", "[dot]");
        }

        /// <summary>Decode a string that was previously given by
        /// EncodeJsonName().</summary>
        public static string DecodeJsonName(string encodedName)
        {
            if (encodedName == null)
            {
                return null;
            }
            return encodedName.Replace("[dot]", ".");
        }

        /// <summary>Send an email to invite someone to work on the project</summary>
        public async Task<IRpcMethodResult> Invite(string email)
        {
            TEntity project = await Projects.GetAsync(ResourceId);
            if (project == null)
                return InvalidParamsError();

            // Does a current project-user already have this email?
            if (project.Users.Select(pu => _users.GetAsync(pu.UserRef).Result.Email)
                .Any(puem => puem == email))
            {
                return Ok(AlreadyProjectMemberResponse);
            }

            SiteOptions siteOptions = _siteOptions.Value;
            string url;
            string additionalMessage = null;
            if (project.ShareEnabled && project.ShareLevel == SharingLevel.Anyone)
            {
                url = $"{siteOptions.Origin}projects/{ResourceId}?sharing=true";
                additionalMessage = "This link can be shared with others so they can join the project too.";
            }
            else if ((project.ShareEnabled && project.ShareLevel == SharingLevel.Specific) || IsUserProjectAdmin(project))
            {
                // Invite a specific person
                // Reuse prior code, if any
                var encodedEmail = EncodeJsonName(email);
                project.ShareKeys.TryGetValue(encodedEmail, out string code);
                code = code ?? SecurityUtils.GenerateKey();
                url = $"{siteOptions.Origin}projects/{ResourceId}?sharing=true&shareKey={code}";
                await Projects.UpdateAsync(p => p.Id == ResourceId, update => update.Set(p => p.ShareKeys[encodedEmail], code));
                additionalMessage = "This link will only work for this email address.";
            }
            else
            {
                return ForbiddenError();
            }

            User inviter = await _users.GetAsync(UserId);
            string subject = $"You've been invited to the project {project.ProjectName} on {siteOptions.Name}";
            string body = "<p>Hello </p><p></p>" +
                $"<p>{inviter.Name} invites you to join the {project.ProjectName} project on {siteOptions.Name}." +
                "</p><p></p>" +
                "<p>You're almost ready to start. Just click the link below to complete your signup and " +
                "then you will be ready to get started.</p><p></p>" +
                $"<p>To join, go to {url}</p><p></p>" +
                $"<p>{additionalMessage}</p><p></p>" +
                $"<p>Regards,</p><p>The {siteOptions.Name} team</p>";
            await _emailService.SendEmailAsync(email, subject, body);
            return Ok();
        }

        /// <summary>Add user to project, if sharing, optionally by a specific shareKey code that was sent to the user by email.</summary>
        public async Task<IRpcMethodResult> CheckLinkSharing(string shareKey = null)
        {
            TEntity project = await Projects.GetAsync(ResourceId);
            if (project == null)
                return InvalidParamsError();

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
                if (project.ShareKeys == null || !project.ShareKeys.ContainsValue(shareKey))
                {
                    return ForbiddenError();
                }
                var currentUserEmail = EncodeJsonName((await _users.GetAsync(UserId)).Email);
                if (project.ShareKeys[currentUserEmail] == shareKey)
                {
                    await AddUserToProject(project);
                    await Projects.UpdateAsync(p => p.Id == ResourceId, update => update.Unset(p => p.ShareKeys[currentUserEmail]));
                    return Ok();
                }
            }

            await AddUserToProject(project);
            return Ok();
        }

        /// <summary>Is there already a pending invitation to the project for the specified email address?</summary>
        public async Task<IRpcMethodResult> IsAlreadyInvited(string email)
        {
            if (email == null)
            {
                return Ok(false);
            }
            var project = await Projects.GetAsync(ResourceId);
            return Ok(project.ShareKeys.ContainsKey(EncodeJsonName(email)));
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
