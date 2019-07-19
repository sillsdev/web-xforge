using System.Linq;
using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Utils;

namespace SIL.XForge.Services
{
    public abstract class ProjectService<TModel, TSecret> : IProjectService<TModel> where TModel : Project, new()
        where TSecret : ProjectSecret
    {
        private readonly IEmailService _emailService;
        private readonly ISecurityService _securityService;

        public ProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IEmailService emailService, IRepository<TSecret> projectSecrets, ISecurityService securityService)
        {
            RealtimeService = realtimeService;
            SiteOptions = siteOptions;
            _emailService = emailService;
            ProjectSecrets = projectSecrets;
            _securityService = securityService;
        }

        protected IRealtimeService RealtimeService { get; }
        protected IOptions<SiteOptions> SiteOptions { get; }
        protected IRepository<TSecret> ProjectSecrets { get; }
        protected abstract string ProjectAdminRole { get; }

        public abstract Task<string> CreateProjectAsync(string userId, TModel newProject);

        public abstract Task DeleteProjectAsync(string userId, string projectId);

        public async Task AddUserAsync(string userId, string projectId, string projectRole = null)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<TModel> projectDoc = conn.Get<TModel>(RootDataTypes.Projects, projectId);
                await projectDoc.FetchAsync();
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");

                IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, userId);
                await userDoc.FetchAsync();
                if (!userDoc.IsLoaded)
                    throw new DataNotFoundException("The user does not exist.");

                if (userDoc.Data.Role == SystemRoles.User || projectRole == null)
                {
                    Attempt<string> attempt = await TryGetProjectRoleAsync(projectDoc.Data, userId);
                    if (!attempt.TryResult(out projectRole))
                        throw new ForbiddenException();
                }

                await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole);
            }
        }

        public async Task RemoveUserAsync(string userId, string projectId, string projectUserId)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<TModel> projectDoc = conn.Get<TModel>(RootDataTypes.Projects, projectId);
                await projectDoc.FetchAsync();
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");

                if (userId != projectUserId && !IsProjectAdmin(projectDoc.Data, userId))
                    throw new ForbiddenException();

                IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, projectUserId);
                await userDoc.FetchAsync();
                if (!userDoc.IsLoaded)
                    throw new DataNotFoundException("The user does not exist.");

                await RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
            }
        }

        public async Task<bool> InviteAsync(string userId, string projectId, string email)
        {
            Attempt<TModel> projectAttempt = await RealtimeService.TryGetSnapshotAsync<TModel>(RootDataTypes.Projects,
                projectId);
            if (!projectAttempt.TryResult(out TModel project))
                throw new DataNotFoundException("The project does not exist.");
            if (await RealtimeService.QuerySnapshots<User>(RootDataTypes.Users)
                .AnyAsync(u => project.UserRoles.Keys.Contains(u.Id) && u.Email == email))
            {
                return false;
            }
            SiteOptions siteOptions = SiteOptions.Value;
            string url;
            string additionalMessage = null;
            if (project.ShareEnabled && project.ShareLevel == SharingLevel.Anyone)
            {
                url = $"{siteOptions.Origin}projects/{projectId}?sharing=true";
                additionalMessage = "This link can be shared with others so they can join the project too.";
            }
            else if ((project.ShareEnabled && project.ShareLevel == SharingLevel.Specific)
                || IsProjectAdmin(project, userId))
            {
                // Invite a specific person
                // Reuse prior code, if any
                string encodedEmail = EncodeJsonName(email);
                TSecret projectSecret = await ProjectSecrets.UpdateAsync(
                    p => p.Id == projectId && !p.ShareKeys.ContainsKey(encodedEmail),
                    update => update.Set(p => p.ShareKeys[encodedEmail], _securityService.GenerateKey()));
                if (projectSecret == null)
                    projectSecret = await ProjectSecrets.GetAsync(projectId);
                string code = projectSecret.ShareKeys[encodedEmail];
                url = $"{siteOptions.Origin}projects/{projectId}?sharing=true&shareKey={code}";
                additionalMessage = "This link will only work for this email address.";
            }
            else
            {
                throw new ForbiddenException();
            }

            User inviter = await RealtimeService.GetSnapshotAsync<User>(RootDataTypes.Users, userId);
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
            return true;
        }

        /// <summary>Is there already a pending invitation to the project for the specified email address?</summary>
        public async Task<bool> IsAlreadyInvitedAsync(string userId, string projectId, string email)
        {
            Attempt<TModel> projectAttempt = await RealtimeService.TryGetSnapshotAsync<TModel>(RootDataTypes.Projects,
                projectId);
            if (!projectAttempt.TryResult(out TModel project))
                throw new DataNotFoundException("The project does not exist.");
            if (!IsProjectAdmin(project, userId))
                throw new ForbiddenException();

            if (email == null)
                return false;
            TSecret projectSecret = await ProjectSecrets.GetAsync(projectId);
            return projectSecret.ShareKeys.ContainsKey(EncodeJsonName(email));
        }

        public async Task CheckLinkSharingAsync(string userId, string projectId, string shareKey = null)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<TModel> projectDoc = conn.Get<TModel>(RootDataTypes.Projects, projectId);
                await projectDoc.FetchAsync();
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");

                if (!projectDoc.Data.ShareEnabled)
                    throw new ForbiddenException();

                if (projectDoc.Data.ShareLevel != SharingLevel.Anyone
                    && projectDoc.Data.ShareLevel != SharingLevel.Specific)
                {
                    throw new ForbiddenException();
                }

                if (projectDoc.Data.UserRoles.ContainsKey(userId))
                    return;

                IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, userId);
                await userDoc.FetchAsync();
                Attempt<string> attempt = await TryGetProjectRoleAsync(projectDoc.Data, userId);
                string projectRole = attempt.Result;
                if (projectDoc.Data.ShareLevel == SharingLevel.Specific)
                {
                    string currentUserEmail = EncodeJsonName(userDoc.Data.Email);
                    TSecret projectSecret = await ProjectSecrets.UpdateAsync(
                        p => p.Id == projectId && p.ShareKeys[currentUserEmail] == shareKey,
                        update => update.Unset(p => p.ShareKeys[currentUserEmail]));
                    if (projectSecret != null)
                        await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole);
                    else
                        throw new ForbiddenException();
                }
                else
                {
                    await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole);
                }
            }
        }

        public Task<bool> IsAuthorizedAsync(string projectId, string userId)
        {
            return RealtimeService.QuerySnapshots<TModel>(RootDataTypes.Projects)
                .AnyAsync(p => p.Id == projectId && p.UserRoles.ContainsKey(userId));
        }

        public async Task<Uri> SaveAudioAsync(string projectId, string fileName, Stream inputStream)
        {
            string audioDir = Path.Combine(SiteOptions.Value.SiteDir, "audio", projectId);
            if (!Directory.Exists(audioDir))
                Directory.CreateDirectory(audioDir);
            string path = Path.Combine(audioDir, fileName);
            if (File.Exists(path))
                File.Delete(path);
            using (var fileStream = new FileStream(path, FileMode.Create))
                await inputStream.CopyToAsync(fileStream);
            var uri = new Uri(SiteOptions.Value.Origin, $"{projectId}/{fileName}");
            return uri;
        }

        /// <summary>Encode the input so it is easier to use as a JSON object
        /// name using our libraries. Replaces dot characters. A proper encoder
        /// would do much more (https://json.org/).</summary>
        internal static string EncodeJsonName(string name)
        {
            if (name == null)
            {
                return null;
            }
            return name.Replace(".", "[dot]");
        }

        /// <summary>Decode a string that was previously given by
        /// EncodeJsonName().</summary>
        internal static string DecodeJsonName(string encodedName)
        {
            if (encodedName == null)
            {
                return null;
            }
            return encodedName.Replace("[dot]", ".");
        }

        protected virtual async Task AddUserToProjectAsync(IConnection conn, IDocument<TModel> projectDoc,
            IDocument<User> userDoc, string projectRole)
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserRoles[userDoc.Id], projectRole));
            string siteId = SiteOptions.Value.Id;
            await userDoc.SubmitJson0OpAsync(op => op.Add(u => u.Sites[siteId].Projects, projectDoc.Id));
        }

        protected virtual async Task RemoveUserFromProjectAsync(IConnection conn, IDocument<TModel> projectDoc,
            IDocument<User> userDoc)
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.UserRoles[userDoc.Id]));
            string siteId = SiteOptions.Value.Id;
            int index = userDoc.Data.Sites[siteId].Projects.IndexOf(projectDoc.Id);
            await userDoc.SubmitJson0OpAsync(op => op.Remove(u => u.Sites[siteId].Projects, index));
        }

        protected bool IsProjectAdmin(TModel project, string userId)
        {
            return project.UserRoles.TryGetValue(userId, out string role) && role == ProjectAdminRole;
        }

        protected abstract Task<Attempt<string>> TryGetProjectRoleAsync(TModel project, string userId);
    }
}
