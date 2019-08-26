using System.Linq;
using System.Collections.Generic;
using System;
using System.IO;
using System.Linq.Expressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class manages SF projects.
    /// </summary>
    public class SFProjectService : ProjectService<SFProject, SFProjectSecret>, ISFProjectService
    {
        private readonly IEngineService _engineService;
        private readonly ISyncService _syncService;
        private readonly IParatextService _paratextService;
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<TranslateMetrics> _translateMetrics;

        public SFProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IAudioService audioService, IEmailService emailService, IRepository<SFProjectSecret> projectSecrets,
            ISecurityService securityService, IFileSystemService fileSystemService, IEngineService engineService,
            ISyncService syncService, IParatextService paratextService, IRepository<UserSecret> userSecrets,
            IRepository<TranslateMetrics> translateMetrics)
            : base(realtimeService, siteOptions, audioService, emailService, projectSecrets, securityService,
                fileSystemService)
        {
            _engineService = engineService;
            _syncService = syncService;
            _paratextService = paratextService;
            _userSecrets = userSecrets;
            _translateMetrics = translateMetrics;
        }

        protected override string ProjectAdminRole => SFProjectRole.Administrator;

        public async Task<string> CreateProjectAsync(string curUserId, SFProject newProject)
        {
            Attempt<string> attempt = await TryGetProjectRoleAsync(newProject, curUserId);
            if (!attempt.TryResult(out string projectRole) || projectRole != SFProjectRole.Administrator)
                throw new ForbiddenException();

            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = await conn.CreateAsync<SFProject>(ObjectId.GenerateNewId().ToString(),
                    newProject);
                await ProjectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id });

                IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
                await AddUserToProjectAsync(conn, projectDoc, userDoc, SFProjectRole.Administrator);

                if (newProject.TranslateEnabled)
                {
                    var project = new Machine.WebApi.Models.Project
                    {
                        Id = projectDoc.Id,
                        SourceLanguageTag = newProject.SourceInputSystem.Tag,
                        TargetLanguageTag = newProject.InputSystem.Tag
                    };
                    await _engineService.AddProjectAsync(project);
                }
                await _syncService.SyncAsync(projectDoc.Id, curUserId, true);
                return projectDoc.Id;
            }
        }

        public async Task DeleteProjectAsync(string curUserId, string projectId)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, curUserId))
                    throw new ForbiddenException();

                // delete the project first, so that users get notified about the deletion
                string[] projectUserIds = projectDoc.Data.UserRoles.Keys.ToArray();
                await projectDoc.DeleteAsync();
                async Task removeUser(string projectUserId)
                {
                    IDocument<User> userDoc = await conn.FetchAsync<User>(projectUserId);
                    await RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
                }
                var tasks = new List<Task>();
                foreach (string projectUserId in projectUserIds)
                    tasks.Add(removeUser(projectUserId));
                await Task.WhenAll(tasks);
            }

            await ProjectSecrets.DeleteAsync(projectId);
            await RealtimeService.DeleteProjectAsync(projectId);
            await _engineService.RemoveProjectAsync(projectId);
            string syncDir = Path.Combine(SiteOptions.Value.SiteDir, "sync", projectId);
            if (FileSystemService.DirectoryExists(syncDir))
                FileSystemService.DeleteDirectory(syncDir);
            string audioDir = GetAudioDir(projectId);
            if (FileSystemService.DirectoryExists(audioDir))
                FileSystemService.DeleteDirectory(audioDir);
        }

        public async Task UpdateSettingsAsync(string curUserId, string projectId, SFProjectSettings settings)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, curUserId))
                    throw new ForbiddenException();

                await projectDoc.SubmitJson0OpAsync(op =>
                {
                    UpdateSetting(op, p => p.TranslateEnabled, settings.TranslateEnabled);
                    UpdateSetting(op, p => p.SourceParatextId, settings.SourceParatextId);
                    UpdateSetting(op, p => p.SourceInputSystem, settings.SourceInputSystem);

                    UpdateSetting(op, p => p.CheckingEnabled, settings.CheckingEnabled);
                    UpdateSetting(op, p => p.UsersSeeEachOthersResponses, settings.UsersSeeEachOthersResponses);
                    UpdateSetting(op, p => p.ShareEnabled, settings.ShareEnabled);
                    UpdateSetting(op, p => p.ShareLevel, settings.ShareLevel);
                });

                bool translateEnabledSet = settings.TranslateEnabled != null;
                bool sourceParatextIdSet = settings.SourceParatextId != null;
                bool checkingEnabledSet = settings.CheckingEnabled != null;
                // check if a sync needs to be run
                if (translateEnabledSet || sourceParatextIdSet || checkingEnabledSet)
                {
                    bool trainEngine = false;
                    if (translateEnabledSet || sourceParatextIdSet)
                    {
                        if (projectDoc.Data.TranslateEnabled && projectDoc.Data.SourceParatextId != null)
                        {
                            // translate task was enabled or source project changed

                            // recreate Machine project only if source project changed
                            if (!translateEnabledSet && sourceParatextIdSet)
                                await _engineService.RemoveProjectAsync(projectId);
                            var project = new Machine.WebApi.Models.Project
                            {
                                Id = projectId,
                                SourceLanguageTag = projectDoc.Data.SourceInputSystem.Tag,
                                TargetLanguageTag = projectDoc.Data.InputSystem.Tag
                            };
                            await _engineService.AddProjectAsync(project);
                            trainEngine = true;
                        }
                        else
                        {
                            // translate task was disabled or source project set to null
                            await _engineService.RemoveProjectAsync(projectId);
                        }
                    }

                    await _syncService.SyncAsync(projectId, curUserId, trainEngine);
                }
            }
        }

        public async Task AddTranslateMetricsAsync(string curUserId, string projectId, TranslateMetrics metrics)
        {
            Attempt<SFProject> attempt = await RealtimeService.TryGetSnapshotAsync<SFProject>(projectId);
            if (!attempt.TryResult(out SFProject project))
                throw new DataNotFoundException("The project does not exist.");

            if (!project.UserRoles.ContainsKey(curUserId))
                throw new ForbiddenException();

            metrics.UserRef = curUserId;
            metrics.ProjectRef = projectId;
            metrics.Timestamp = DateTime.UtcNow;
            await _translateMetrics.ReplaceAsync(metrics, true);
        }

        public async Task SyncAsync(string curUserId, string projectId)
        {
            Attempt<SFProject> attempt = await RealtimeService.TryGetSnapshotAsync<SFProject>(projectId);
            if (!attempt.TryResult(out SFProject project))
                throw new DataNotFoundException("The project does not exist.");

            if (!IsProjectAdmin(project, curUserId))
                throw new ForbiddenException();

            await _syncService.SyncAsync(projectId, curUserId, false);
        }

        protected override async Task AddUserToProjectAsync(IConnection conn, IDocument<SFProject> projectDoc,
            IDocument<User> userDoc, string projectRole)
        {
            await base.AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole);
            IDocument<SFProjectUserConfig> projectUserConfigDoc = await conn.CreateAsync<SFProjectUserConfig>(
                SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id),
                new SFProjectUserConfig { OwnerRef = userDoc.Id });
        }

        protected override async Task RemoveUserFromProjectAsync(IConnection conn, IDocument<SFProject> projectDoc,
            IDocument<User> userDoc)
        {
            await base.RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
            IDocument<SFProjectUserConfig> projectUserConfigDoc = await conn.FetchAsync<SFProjectUserConfig>(
                SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id));
            await projectUserConfigDoc.DeleteAsync();
        }

        protected async override Task<Attempt<string>> TryGetProjectRoleAsync(SFProject project, string userId)
        {
            Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(userId);
            if (userSecretAttempt.TryResult(out UserSecret userSecret))
            {
                Attempt<string> roleAttempt = await _paratextService.TryGetProjectRoleAsync(userSecret,
                    project.ParatextId);
                if (roleAttempt.TryResult(out string role))
                {
                    return Attempt.Success(role);
                }
            }

            return Attempt.Failure(SFProjectRole.SFReviewer);
        }

        private static void UpdateSetting<T>(Json0OpBuilder<SFProject> builder, Expression<Func<SFProject, T>> field,
            T setting)
        {
            if (setting != null)
                builder.Set(field, setting);
        }
    }
}
