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
    public class SFProjectService : ProjectService<SFProject, SFProjectSecret>, ISFProjectService
    {
        private readonly IEngineService _engineService;
        private readonly ISyncService _syncService;
        private readonly IParatextService _paratextService;
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<TranslateMetrics> _translateMetrics;
        private readonly IFileSystemService _fileSystemService;

        public SFProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IEmailService emailService, IRepository<SFProjectSecret> projectSecrets, ISecurityService securityService,
            IEngineService engineService, ISyncService syncService, IParatextService paratextService,
            IRepository<UserSecret> userSecrets, IRepository<TranslateMetrics> translateMetrics,
            IFileSystemService fileSystemService)
            : base(realtimeService, siteOptions, emailService, projectSecrets, securityService)
        {
            _engineService = engineService;
            _syncService = syncService;
            _paratextService = paratextService;
            _userSecrets = userSecrets;
            _translateMetrics = translateMetrics;
            _fileSystemService = fileSystemService;
        }

        protected override string ProjectAdminRole => SFProjectRoles.Administrator;

        public override async Task<string> CreateProjectAsync(string userId, SFProject newProject)
        {
            Attempt<string> attempt = await TryGetProjectRoleAsync(newProject, userId);
            if (!attempt.TryResult(out string projectRole) || projectRole != SFProjectRoles.Administrator)
                throw new ForbiddenException();

            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = conn.Get<SFProject>(RootDataTypes.Projects,
                    ObjectId.GenerateNewId().ToString());
                await projectDoc.CreateAsync(newProject);
                await ProjectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id });

                IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, userId);
                await userDoc.FetchAsync();
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

        public override async Task DeleteProjectAsync(string userId, string projectId)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = conn.Get<SFProject>(RootDataTypes.Projects, projectId);
                await projectDoc.FetchAsync();
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, userId))
                    throw new ForbiddenException();
                async Task removeUser(IDocument<User> userDoc)
                {
                    await userDoc.FetchAsync();
                    await RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
                }
                var tasks = new List<Task>();
                foreach (string projectUserId in projectDoc.Data.UserRoles.Keys)
                {
                    IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, projectUserId);
                    tasks.Add(removeUser(userDoc));
                }
                await Task.WhenAll(tasks);
                await projectDoc.DeleteAsync();
            }

            await RealtimeService.DeleteProjectAsync(projectId);
            await _engineService.RemoveProjectAsync(projectId);
            string syncDir = Path.Combine(SiteOptions.Value.SiteDir, "sync", projectId);
            if (_fileSystemService.DirectoryExists(syncDir))
                _fileSystemService.DeleteDirectory(syncDir);
        }

        public async Task UpdateTasksAsync(string userId, string projectId, UpdateTasksParams parameters)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync())
            {
                IDocument<SFProject> projectDoc = conn.Get<SFProject>(RootDataTypes.Projects, projectId);
                await projectDoc.FetchAsync();
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, userId))
                    throw new ForbiddenException();

                await projectDoc.SubmitJson0OpAsync(op =>
                {
                    UpdateSetting(op, p => p.CheckingEnabled, parameters.CheckingEnabled);
                    UpdateSetting(op, p => p.TranslateEnabled, parameters.TranslateEnabled);
                    UpdateSetting(op, p => p.SourceParatextId, parameters.SourceParatextId);
                    UpdateSetting(op, p => p.SourceInputSystem, parameters.SourceInputSystem);
                });

                bool translateEnabledSet = parameters.TranslateEnabled != null;
                bool sourceParatextIdSet = parameters.SourceParatextId != null;
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

        public async Task AddTranslateMetricsAsync(string userId, string projectId, TranslateMetrics metrics)
        {
            Attempt<SFProject> attempt = await RealtimeService.TryGetSnapshotAsync<SFProject>(RootDataTypes.Projects,
                projectId);
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
            Attempt<SFProject> attempt = await RealtimeService.TryGetSnapshotAsync<SFProject>(RootDataTypes.Projects,
                projectId);
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
            IDocument<SFProjectUserConfig> projectUserConfigDoc = conn.Get<SFProjectUserConfig>(
                SFRootDataTypes.ProjectUserConfigs, SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id));
            await projectUserConfigDoc.CreateAsync(new SFProjectUserConfig { OwnerRef = userDoc.Id });
        }

        protected override async Task RemoveUserFromProjectAsync(IConnection conn, IDocument<SFProject> projectDoc,
            IDocument<User> userDoc)
        {
            await base.RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
            IDocument<SFProjectUserConfig> projectUserConfigDoc = conn.Get<SFProjectUserConfig>(
                SFRootDataTypes.ProjectUserConfigs, SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id));
            await projectUserConfigDoc.FetchAsync();
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
