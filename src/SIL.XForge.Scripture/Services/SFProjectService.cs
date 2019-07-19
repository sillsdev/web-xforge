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
        private readonly IFileSystemService _fileSystemService;

        public SFProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IOptions<AudioOptions> audioOptions, IEmailService emailService, IRepository<SFProjectSecret> projectSecrets,
            ISecurityService securityService, IEngineService engineService, ISyncService syncService,
            IParatextService paratextService, IRepository<UserSecret> userSecrets,
            IRepository<TranslateMetrics> translateMetrics, IFileSystemService fileSystemService)
            : base(realtimeService, siteOptions, audioOptions, emailService, projectSecrets, securityService)
        {
            _engineService = engineService;
            _syncService = syncService;
            _paratextService = paratextService;
            _userSecrets = userSecrets;
            _translateMetrics = translateMetrics;
            _fileSystemService = fileSystemService;
        }

        protected override string ProjectAdminRole => SFProjectRoles.Administrator;

        public async Task<string> CreateProjectAsync(string userId, SFProject newProject)
        {
            Attempt<string> attempt = await TryGetProjectRoleAsync(newProject, userId);
            if (!attempt.TryResult(out string projectRole) || projectRole != SFProjectRoles.Administrator)
                throw new ForbiddenException();

            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = await conn.CreateAsync<SFProject>(ObjectId.GenerateNewId().ToString(),
                    newProject);
                await ProjectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id });

                IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
                await AddUserToProjectAsync(conn, projectDoc, userDoc, SFProjectRoles.Administrator);

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
                await _syncService.SyncAsync(projectDoc.Id, userId, true);
                return projectDoc.Id;
            }
        }

        public async Task DeleteProjectAsync(string userId, string projectId)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, userId))
                    throw new ForbiddenException();
                async Task removeUser(string projectUserId)
                {
                    IDocument<User> userDoc = await conn.FetchAsync<User>(projectUserId);
                    await RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
                }
                var tasks = new List<Task>();
                foreach (string projectUserId in projectDoc.Data.UserRoles.Keys)
                    tasks.Add(removeUser(projectUserId));
                await Task.WhenAll(tasks);
                await projectDoc.DeleteAsync();
            }

            await ProjectSecrets.DeleteAsync(projectId);
            await RealtimeService.DeleteProjectAsync(projectId);
            await _engineService.RemoveProjectAsync(projectId);
            string syncDir = Path.Combine(SiteOptions.Value.SiteDir, "sync", projectId);
            if (_fileSystemService.DirectoryExists(syncDir))
                _fileSystemService.DeleteDirectory(syncDir);
        }

        public async Task UpdateSettingsAsync(string userId, string projectId, SFProjectSettings settings)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, userId))
                    throw new ForbiddenException();

                await projectDoc.SubmitJson0OpAsync(op =>
                {
                    UpdateSetting(op, p => p.TranslateEnabled, settings.TranslateEnabled);
                    UpdateSetting(op, p => p.SourceParatextId, settings.SourceParatextId);
                    UpdateSetting(op, p => p.SourceInputSystem, settings.SourceInputSystem);

                    UpdateSetting(op, p => p.CheckingEnabled, settings.CheckingEnabled);
                    UpdateSetting(op, p => p.DownloadAudioFiles, settings.DownloadAudioFiles);
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

                    await _syncService.SyncAsync(projectId, userId, trainEngine);
                }
            }
        }

        public async Task AddTranslateMetricsAsync(string userId, string projectId, TranslateMetrics metrics)
        {
            Attempt<SFProject> attempt = await RealtimeService.TryGetSnapshotAsync<SFProject>(projectId);
            if (!attempt.TryResult(out SFProject project))
                throw new DataNotFoundException("The project does not exist.");

            if (!project.UserRoles.ContainsKey(userId))
                throw new ForbiddenException();

            metrics.UserRef = userId;
            metrics.ProjectRef = projectId;
            metrics.Timestamp = DateTime.UtcNow;
            await _translateMetrics.ReplaceAsync(metrics, true);
        }

        public async Task SyncAsync(string userId, string projectId)
        {
            Attempt<SFProject> attempt = await RealtimeService.TryGetSnapshotAsync<SFProject>(projectId);
            if (!attempt.TryResult(out SFProject project))
                throw new DataNotFoundException("The project does not exist.");

            if (!IsProjectAdmin(project, userId))
                throw new ForbiddenException();

            await _syncService.SyncAsync(projectId, userId, false);
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

            return Attempt.Failure(SFProjectRoles.SFReviewer);
        }

        private static void UpdateSetting<T>(Json0OpBuilder<SFProject> builder, Expression<Func<SFProject, T>> field,
            T setting)
        {
            if (setting != null)
                builder.Set(field, setting);
        }
    }
}
