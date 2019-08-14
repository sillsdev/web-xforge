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
    /// <summary>
    /// This class contains the common functionality for managing xForge projects.
    /// </summary>
    public abstract class ProjectService<TModel, TSecret> : IProjectService where TModel : Project, new()
        where TSecret : ProjectSecret
    {
        private readonly IEmailService _emailService;
        private readonly ISecurityService _securityService;
        private readonly IAudioService _audioService;

        public ProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IAudioService audioService, IEmailService emailService, IRepository<TSecret> projectSecrets,
            ISecurityService securityService, IFileSystemService fileSystemService)
        {
            RealtimeService = realtimeService;
            SiteOptions = siteOptions;
            _audioService = audioService;
            _emailService = emailService;
            ProjectSecrets = projectSecrets;
            _securityService = securityService;
            FileSystemService = fileSystemService;
        }

        protected IRealtimeService RealtimeService { get; }
        protected IOptions<SiteOptions> SiteOptions { get; }
        protected IRepository<TSecret> ProjectSecrets { get; }
        protected IFileSystemService FileSystemService { get; }
        protected abstract string ProjectAdminRole { get; }

        public async Task AddUserAsync(string userId, string projectId, string projectRole)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<TModel> projectDoc = await conn.FetchAsync<TModel>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");

                IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
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
                IDocument<TModel> projectDoc = await conn.FetchAsync<TModel>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");

                if (userId != projectUserId && !IsProjectAdmin(projectDoc.Data, userId))
                    throw new ForbiddenException();

                IDocument<User> userDoc = await conn.FetchAsync<User>(projectUserId);
                if (!userDoc.IsLoaded)
                    throw new DataNotFoundException("The user does not exist.");

                await RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
            }
        }

        public async Task UpdateRoleAsync(string userId, string projectId, string projectRole)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<TModel> projectDoc = await conn.FetchAsync<TModel>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");

                await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserRoles[userId], projectRole));
            }
        }

        public async Task<bool> InviteAsync(string userId, string projectId, string email)
        {
            Attempt<TModel> projectAttempt = await RealtimeService.TryGetSnapshotAsync<TModel>(projectId);
            if (!projectAttempt.TryResult(out TModel project))
                throw new DataNotFoundException("The project does not exist.");
            if (await RealtimeService.QuerySnapshots<User>()
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

            User inviter = await RealtimeService.GetSnapshotAsync<User>(userId);
            string subject = $"You've been invited to the project {project.ProjectName} on {siteOptions.Name}";
            string body = "<p>Hello,</p><p></p>" +
                $"<p>{inviter.Name} invites you to join the {project.ProjectName} project on {siteOptions.Name}." +
                "</p><p></p>" +
                "<p>Just click the link below, choose how to log in, and you will be ready to start.</p><p></p>" +
                $"<p>To join, go to <a href=\"{url}\">{url}</a></p><p></p>" +
                $"<p>{additionalMessage}</p><p></p>" +
                $"<p>If you are not already a {siteOptions.Name} user, then after clicking the link, click <b>Sign Up</b> and do one of the following:" +
                $"<ul><li>Click <b>Sign up with Paratext</b> and follow the instructions to access {siteOptions.Name} using an existing Paratext account, or</li>" +
                $"<li>Click <b>Sign up with Google</b> and follow the instructions to access {siteOptions.Name} using an existing Google account (such as a Gmail account), or</li>" +
                $"<li>Enter your email address and a new password for your {siteOptions.Name} account and click Sign up.</li></ul></p><p></p>" +
                $"<p>Regards,</p><p>The {siteOptions.Name} team</p>";
            await _emailService.SendEmailAsync(email, subject, body);
            return true;
        }

        /// <summary>Is there already a pending invitation to the project for the specified email address?</summary>
        public async Task<bool> IsAlreadyInvitedAsync(string userId, string projectId, string email)
        {
            Attempt<TModel> projectAttempt = await RealtimeService.TryGetSnapshotAsync<TModel>(projectId);
            if (!projectAttempt.TryResult(out TModel project))
                throw new DataNotFoundException("The project does not exist.");
            if (!IsProjectAdmin(project, userId) && !project.ShareEnabled)
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
                IDocument<TModel> projectDoc = await conn.FetchAsync<TModel>(projectId);
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

                IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
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
            return RealtimeService.QuerySnapshots<TModel>()
                .AnyAsync(p => p.Id == projectId && p.UserRoles.ContainsKey(userId));
        }

        public async Task<Uri> SaveAudioAsync(string userId, string projectId, string dataId, string extension,
            Stream inputStream)
        {
            Attempt<TModel> projectAttempt = await RealtimeService.TryGetSnapshotAsync<TModel>(projectId);
            if (!projectAttempt.TryResult(out TModel project))
                throw new DataNotFoundException("The project does not exist.");

            if (!project.UserRoles.ContainsKey(userId))
                throw new ForbiddenException();

            string audioDir = GetAudioDir(projectId);
            if (!FileSystemService.DirectoryExists(audioDir))
                FileSystemService.CreateDirectory(audioDir);
            string outputPath = Path.Combine(audioDir, $"{userId}_{dataId}.mp3");
            if (string.Equals(extension, ".mp3", StringComparison.InvariantCultureIgnoreCase))
            {
                using (Stream fileStream = FileSystemService.OpenFile(outputPath, FileMode.Create))
                    await inputStream.CopyToAsync(fileStream);
            }
            else
            {
                string tempPath = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName() + extension);
                try
                {
                    using (Stream fileStream = FileSystemService.OpenFile(tempPath, FileMode.Create))
                        await inputStream.CopyToAsync(fileStream);
                    await _audioService.ConvertToMp3Async(tempPath, outputPath);
                }
                finally
                {
                    if (FileSystemService.FileExists(tempPath))
                        FileSystemService.DeleteFile(tempPath);
                }
            }
            string outputFileName = Path.GetFileName(outputPath);
            var uri = new Uri(SiteOptions.Value.Origin,
                $"assets/audio/{projectId}/{outputFileName}?t={DateTime.UtcNow.ToFileTime()}");
            return uri;
        }

        public async Task DeleteAudioAsync(string userId, string projectId, string ownerId, string dataId)
        {
            Attempt<TModel> projectAttempt = await RealtimeService.TryGetSnapshotAsync<TModel>(projectId);
            if (!projectAttempt.TryResult(out TModel project))
                throw new DataNotFoundException("The project does not exist.");

            if (userId != ownerId && !IsProjectAdmin(project, userId))
                throw new ForbiddenException();

            string audioDir = GetAudioDir(projectId);
            string filePath = Path.Combine(audioDir, $"{ownerId}_{dataId}.mp3");
            if (FileSystemService.FileExists(filePath))
                FileSystemService.DeleteFile(filePath);
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
            if (projectDoc.IsLoaded)
                await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.UserRoles[userDoc.Id]));
            string siteId = SiteOptions.Value.Id;
            await userDoc.SubmitJson0OpAsync(op =>
            {
                int index = userDoc.Data.Sites[siteId].Projects.IndexOf(projectDoc.Id);
                op.Remove(u => u.Sites[siteId].Projects, index);
                if (userDoc.Data.Sites[siteId].CurrentProjectId == projectDoc.Id)
                    op.Unset(u => u.Sites[siteId].CurrentProjectId);
            });
        }

        protected bool IsProjectAdmin(TModel project, string userId)
        {
            return project.UserRoles.TryGetValue(userId, out string role) && role == ProjectAdminRole;
        }

        protected string GetAudioDir(string projectId)
        {
            return Path.Combine(SiteOptions.Value.SiteDir, "audio", projectId);
        }

        protected abstract Task<Attempt<string>> TryGetProjectRoleAsync(TModel project, string userId);
    }
}
