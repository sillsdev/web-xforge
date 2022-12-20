using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
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
    public abstract class ProjectService<TModel, TSecret> : IProjectService
        where TModel : Project, new()
        where TSecret : ProjectSecret
    {
        private readonly IAudioService _audioService;

        public ProjectService(
            IRealtimeService realtimeService,
            IOptions<SiteOptions> siteOptions,
            IAudioService audioService,
            IRepository<TSecret> projectSecrets,
            IFileSystemService fileSystemService
        )
        {
            RealtimeService = realtimeService;
            SiteOptions = siteOptions;
            _audioService = audioService;
            ProjectSecrets = projectSecrets;
            FileSystemService = fileSystemService;
        }

        protected IRealtimeService RealtimeService { get; }
        protected IOptions<SiteOptions> SiteOptions { get; }
        protected IRepository<TSecret> ProjectSecrets { get; }
        protected IFileSystemService FileSystemService { get; }
        protected abstract string ProjectAdminRole { get; }

        public async Task AddUserAsync(string curUserId, string projectId, string projectRole)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

                IDocument<User> userDoc = await GetUserDocAsync(curUserId, conn);

                if (userDoc.Data.Role != SystemRole.SystemAdmin || projectRole == null)
                {
                    Attempt<string> attempt = await TryGetProjectRoleAsync(projectDoc.Data, curUserId);
                    if (!attempt.TryResult(out projectRole))
                        throw new ForbiddenException();
                }

                await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole);
            }
        }

        /// <summary>
        /// Disassociate user projectUserId from project projectId, if curUserId is allowed to cause that.
        /// </summary>
        public async Task RemoveUserAsync(string curUserId, string projectId, string projectUserId)
        {
            if (curUserId == null || projectId == null || projectUserId == null)
            {
                throw new ArgumentNullException();
            }
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

                if (curUserId != projectUserId && !IsProjectAdmin(projectDoc.Data, curUserId))
                    throw new ForbiddenException();
                await RemoveUserCoreAsync(conn, curUserId, projectId, projectUserId);
            }
        }

        /// <summary>
        /// Disassociate user projectUserId from project projectId. No permissions check is performed.
        /// </summary>
        public async Task RemoveUserWithoutPermissionsCheckAsync(
            string curUserId,
            string projectId,
            string projectUserId
        )
        {
            if (curUserId == null || projectId == null || projectUserId == null)
            {
                throw new ArgumentNullException();
            }
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                await RemoveUserCoreAsync(conn, curUserId, projectId, projectUserId);
            }
        }

        /// <summary>
        /// Disassociate user projectUserId from project projectId, without checking permissions.
        /// </summary>
        private async Task RemoveUserCoreAsync(
            IConnection conn,
            string curUserId,
            string projectId,
            string projectUserId
        )
        {
            if (curUserId == null || projectId == null || projectUserId == null)
            {
                throw new ArgumentNullException();
            }
            IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);
            IDocument<User> userDoc = await GetUserDocAsync(projectUserId, conn);
            await RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
        }

        /// <summary>
        /// Disassociate user projectUserId from all projects on the site that this ProjectService is operating on.
        /// As requested by curUserId. Permissions to do so are not checked.
        /// </summary>
        public async Task RemoveUserFromAllProjectsAsync(string curUserId, string projectUserId)
        {
            if (curUserId == null || projectUserId == null)
            {
                throw new ArgumentNullException();
            }
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<User> userDoc = await GetUserDocAsync(projectUserId, conn);
                IEnumerable<Task> removalTasks = userDoc.Data.Sites[SiteOptions.Value.Id].Projects.Select(
                    (string projectId) => RemoveUserCoreAsync(conn, curUserId, projectId, projectUserId)
                );
                // The removals can be processed in parallel in production, but for unit tests, MemoryRealtimeService
                // does not fully implement concurrent editing of docs, so run them in a sequence.
                foreach (Task task in removalTasks)
                {
                    await task;
                }
            }
        }

        public async Task<string> GetProjectRoleAsync(string curUserId, string projectId)
        {
            TModel project;
            try
            {
                project = await GetProjectAsync(projectId);
            }
            catch (DataNotFoundException)
            {
                return null;
            }
            Attempt<string> attempt = await TryGetProjectRoleAsync(project, curUserId);
            return attempt.Result;
        }

        public async Task UpdateRoleAsync(string curUserId, string systemRole, string projectId, string projectRole)
        {
            if (systemRole != SystemRole.SystemAdmin)
                throw new ForbiddenException();

            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

                await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserRoles[curUserId], projectRole));
            }
        }

        public async Task<Uri> SaveAudioAsync(
            string curUserId,
            string projectId,
            string dataId,
            string extension,
            Stream inputStream
        )
        {
            if (!StringUtils.ValidateId(dataId))
                throw new FormatException($"{nameof(dataId)} is not a valid id.");

            TModel project = await GetProjectAsync(projectId);

            if (!project.UserRoles.ContainsKey(curUserId))
                throw new ForbiddenException();

            string audioDir = GetAudioDir(projectId);
            if (!FileSystemService.DirectoryExists(audioDir))
                FileSystemService.CreateDirectory(audioDir);
            string outputPath = Path.Combine(audioDir, $"{curUserId}_{dataId}.mp3");
            if (string.Equals(extension, ".mp3", StringComparison.InvariantCultureIgnoreCase))
            {
                await using Stream fileStream = FileSystemService.OpenFile(outputPath, FileMode.Create);
                await inputStream.CopyToAsync(fileStream);
            }
            else
            {
                string tempPath = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName() + extension);
                try
                {
                    await using (Stream fileStream = FileSystemService.OpenFile(tempPath, FileMode.Create))
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
            var uri = new Uri(
                SiteOptions.Value.Origin,
                $"assets/audio/{projectId}/{outputFileName}?t={DateTime.UtcNow.ToFileTime()}"
            );
            return uri;
        }

        public async Task DeleteAudioAsync(string curUserId, string projectId, string ownerId, string dataId)
        {
            if (!StringUtils.ValidateId(dataId))
                throw new FormatException($"{nameof(dataId)} is not a valid id.");

            TModel project = await GetProjectAsync(projectId);

            if (curUserId != ownerId && !IsProjectAdmin(project, curUserId))
                throw new ForbiddenException();

            string audioDir = GetAudioDir(projectId);
            string filePath = Path.Combine(audioDir, $"{ownerId}_{dataId}.mp3");
            if (FileSystemService.FileExists(filePath))
                FileSystemService.DeleteFile(filePath);
        }

        public async Task SetSyncDisabledAsync(string curUserId, string systemRole, string projectId, bool isDisabled)
        {
            if (systemRole != SystemRole.SystemAdmin)
                throw new ForbiddenException();

            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);
                await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.SyncDisabled, isDisabled));
            }
        }

        public async Task SetUserProjectPermissions(
            string curUserId,
            string projectId,
            string userId,
            string[] permissions
        )
        {
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, curUserId))
                    throw new ForbiddenException();

                if (permissions.Length == 0)
                {
                    await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.UserPermissions[userId]));
                }
                else
                {
                    await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserPermissions[userId], permissions));
                }
            }
        }

        protected virtual async Task AddUserToProjectAsync(
            IConnection conn,
            IDocument<TModel> projectDoc,
            IDocument<User> userDoc,
            string projectRole,
            bool removeShareKeys = true
        )
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserRoles[userDoc.Id], projectRole));
            if (removeShareKeys)
            {
                await ProjectSecrets.UpdateAsync(
                    p => p.Id == projectDoc.Id,
                    update => update.RemoveAll(p => p.ShareKeys, sk => sk.Email == userDoc.Data.Email)
                );
            }
            string siteId = SiteOptions.Value.Id;
            await userDoc.SubmitJson0OpAsync(op => op.Add(u => u.Sites[siteId].Projects, projectDoc.Id));
        }

        internal protected virtual async Task RemoveUserFromProjectAsync(
            IConnection conn,
            IDocument<TModel> projectDoc,
            IDocument<User> userDoc
        )
        {
            if (conn == null || projectDoc == null || userDoc == null)
            {
                throw new ArgumentNullException();
            }
            if (projectDoc.IsLoaded)
            {
                await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.UserRoles[userDoc.Id]));
                await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.UserPermissions[userDoc.Id]));
            }
            string siteId = SiteOptions.Value.Id;
            await userDoc.SubmitJson0OpAsync(op =>
            {
                int index = userDoc.Data.Sites[siteId].Projects.IndexOf(projectDoc.Id);
                op.Remove(u => u.Sites[siteId].Projects, index);
                if (userDoc.Data.Sites[siteId].CurrentProjectId == projectDoc.Id)
                    op.Unset(u => u.Sites[siteId].CurrentProjectId);
            });
        }

        protected bool IsOnProject(TModel project, string userId)
        {
            return project.UserRoles.ContainsKey(userId);
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

        protected async Task<TModel> GetProjectAsync(string projectId)
        {
            Attempt<TModel> projectAttempt = await RealtimeService.TryGetSnapshotAsync<TModel>(projectId);
            if (!projectAttempt.TryResult(out TModel project))
            {
                throw new DataNotFoundException("The project does not exist.");
            }
            return project;
        }

        protected async Task<IDocument<TModel>> GetProjectDocAsync(string projectId, IConnection conn)
        {
            IDocument<TModel> projectDoc = await conn.FetchAsync<TModel>(projectId);
            if (!projectDoc.IsLoaded)
                throw new DataNotFoundException("The project does not exist.");
            return projectDoc;
        }

        protected async Task<IDocument<User>> GetUserDocAsync(string userId, IConnection conn)
        {
            IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
            if (!userDoc.IsLoaded)
                throw new DataNotFoundException("The user does not exist.");
            return userDoc;
        }
    }
}
