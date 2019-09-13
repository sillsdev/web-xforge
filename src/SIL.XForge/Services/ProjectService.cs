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
        private readonly IAudioService _audioService;

        public ProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IAudioService audioService, IRepository<TSecret> projectSecrets, IFileSystemService fileSystemService)
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
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

                IDocument<User> userDoc = await GetUserDocAsync(curUserId, conn);

                if (userDoc.Data.Role == SystemRole.User || projectRole == null)
                {
                    Attempt<string> attempt = await TryGetProjectRoleAsync(projectDoc.Data, curUserId);
                    if (!attempt.TryResult(out projectRole))
                        throw new ForbiddenException();
                }

                await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole);
            }
        }

        public async Task RemoveUserAsync(string curUserId, string projectId, string projectUserId)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

                if (curUserId != projectUserId && !IsProjectAdmin(projectDoc.Data, curUserId))
                    throw new ForbiddenException();

                IDocument<User> userDoc = await GetUserDocAsync(projectUserId, conn);

                await RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
            }
        }

        public async Task UpdateRoleAsync(string curUserId, string systemRole, string projectId, string projectRole)
        {
            if (systemRole != SystemRole.SystemAdmin)
                throw new ForbiddenException();

            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

                await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserRoles[curUserId], projectRole));
            }
        }

        public async Task<Uri> SaveAudioAsync(string curUserId, string projectId, string dataId, string extension,
            Stream inputStream)
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
