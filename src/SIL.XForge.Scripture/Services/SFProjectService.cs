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
using MachineProject = SIL.Machine.WebApi.Models.Project;

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
        private readonly IEmailService _emailService;
        private readonly ISecurityService _securityService;

        public SFProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IAudioService audioService, IEmailService emailService, IRepository<SFProjectSecret> projectSecrets,
            ISecurityService securityService, IFileSystemService fileSystemService, IEngineService engineService,
            ISyncService syncService, IParatextService paratextService, IRepository<UserSecret> userSecrets,
            IRepository<TranslateMetrics> translateMetrics)
            : base(realtimeService, siteOptions, audioService, projectSecrets, fileSystemService)
        {
            _engineService = engineService;
            _syncService = syncService;
            _paratextService = paratextService;
            _userSecrets = userSecrets;
            _translateMetrics = translateMetrics;
            _emailService = emailService;
            _securityService = securityService;
        }

        protected override string ProjectAdminRole => SFProjectRole.Administrator;

        public async Task<string> CreateProjectAsync(string curUserId, SFProjectCreateSettings settings)
        {
            Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
            if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                throw new DataNotFoundException("The user does not exist.");

            IReadOnlyList<ParatextProject> ptProjects = await _paratextService.GetProjectsAsync(userSecret);

            ParatextProject ptProject = ptProjects.SingleOrDefault(p => p.ParatextId == settings.ParatextId);
            if (ptProject == null)
                throw new DataNotFoundException("The paratext project does not exist.");

            TranslateSource source = null;
            if (settings.SourceParatextId != null)
            {
                ParatextProject sourcePTProject = ptProjects
                    .SingleOrDefault(p => p.ParatextId == settings.SourceParatextId);
                if (sourcePTProject == null)
                    throw new DataNotFoundException("The source paratext project does not exist.");
                source = new TranslateSource
                {
                    Name = sourcePTProject.Name,
                    ParatextId = settings.SourceParatextId,
                    InputSystem = sourcePTProject.InputSystem
                };
            }

            var project = new SFProject
            {
                Name = ptProject.Name,
                ParatextId = settings.ParatextId,
                InputSystem = ptProject.InputSystem,
                TranslateConfig = new TranslateConfig
                {
                    TranslationSuggestionsEnabled = settings.TranslationSuggestionsEnabled,
                    Source = source
                },
                CheckingConfig = new CheckingConfig
                {
                    CheckingEnabled = settings.CheckingEnabled
                }
            };
            Attempt<string> attempt = await TryGetProjectRoleAsync(project, curUserId);
            if (!attempt.TryResult(out string projectRole) || projectRole != SFProjectRole.Administrator)
                throw new ForbiddenException();

            string projectId = ObjectId.GenerateNewId().ToString();
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.CreateAsync<SFProject>(projectId, project);
                await ProjectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id });

                IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
                await AddUserToProjectAsync(conn, projectDoc, userDoc, SFProjectRole.Administrator);

                if (project.TranslateConfig.TranslationSuggestionsEnabled)
                {
                    var machineProject = new MachineProject
                    {
                        Id = projectDoc.Id,
                        SourceLanguageTag = project.TranslateConfig.Source.InputSystem.Tag,
                        TargetLanguageTag = project.InputSystem.Tag
                    };
                    await _engineService.AddProjectAsync(machineProject);
                }
            }

            await _syncService.SyncAsync(curUserId, projectId, true);
            return projectId;
        }

        public async Task DeleteProjectAsync(string curUserId, string projectId)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
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
            TranslateSource source = null;
            if (settings.SourceParatextId != null)
            {
                Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
                if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                    throw new DataNotFoundException("The user does not exist.");

                IReadOnlyList<ParatextProject> ptProjects = await _paratextService.GetProjectsAsync(userSecret);

                ParatextProject sourcePTProject = ptProjects
                    .SingleOrDefault(p => p.ParatextId == settings.SourceParatextId);
                if (sourcePTProject == null)
                    throw new DataNotFoundException("The source paratext project does not exist.");
                source = new TranslateSource
                {
                    Name = sourcePTProject.Name,
                    ParatextId = settings.SourceParatextId,
                    InputSystem = sourcePTProject.InputSystem
                };
            }

            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, curUserId))
                    throw new ForbiddenException();

                await projectDoc.SubmitJson0OpAsync(op =>
                {
                    UpdateSetting(op, p => p.TranslateConfig.TranslationSuggestionsEnabled,
                        settings.TranslationSuggestionsEnabled);
                    UpdateSetting(op, p => p.TranslateConfig.Source, source);

                    UpdateSetting(op, p => p.CheckingConfig.CheckingEnabled, settings.CheckingEnabled);
                    UpdateSetting(op, p => p.CheckingConfig.UsersSeeEachOthersResponses,
                        settings.UsersSeeEachOthersResponses);
                    UpdateSetting(op, p => p.CheckingConfig.ShareEnabled, settings.ShareEnabled);
                    UpdateSetting(op, p => p.CheckingConfig.ShareLevel, settings.ShareLevel);
                });

                bool suggestionsEnabledSet = settings.TranslationSuggestionsEnabled != null;
                bool sourceParatextIdSet = settings.SourceParatextId != null;
                bool checkingEnabledSet = settings.CheckingEnabled != null;
                // check if a sync needs to be run
                if (suggestionsEnabledSet || sourceParatextIdSet || checkingEnabledSet)
                {
                    bool trainEngine = false;
                    if (suggestionsEnabledSet || sourceParatextIdSet)
                    {
                        if (projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled
                            && projectDoc.Data.TranslateConfig.Source != null)
                        {
                            // translate task was enabled or source project changed

                            // recreate Machine project only if source project changed
                            if (!suggestionsEnabledSet && sourceParatextIdSet)
                                await _engineService.RemoveProjectAsync(projectId);
                            var machineProject = new MachineProject
                            {
                                Id = projectId,
                                SourceLanguageTag = projectDoc.Data.TranslateConfig.Source.InputSystem.Tag,
                                TargetLanguageTag = projectDoc.Data.InputSystem.Tag
                            };
                            await _engineService.AddProjectAsync(machineProject);
                            trainEngine = true;
                        }
                        else
                        {
                            // translate task was disabled or source project set to null
                            await _engineService.RemoveProjectAsync(projectId);
                        }
                    }

                    await _syncService.SyncAsync(curUserId, projectId, trainEngine);
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

            await _syncService.SyncAsync(curUserId, projectId, false);
        }

        public async Task<bool> InviteAsync(string curUserId, string projectId, string email)
        {
            SFProject project = await GetProjectAsync(projectId);
            if (await RealtimeService.QuerySnapshots<User>()
                .AnyAsync(u => project.UserRoles.Keys.Contains(u.Id) && u.Email == email))
            {
                return false;
            }
            SiteOptions siteOptions = SiteOptions.Value;
            string url;
            string additionalMessage = null;
            if (project.CheckingConfig.ShareEnabled && project.CheckingConfig.ShareLevel == CheckingShareLevel.Anyone)
            {
                url = $"{siteOptions.Origin}projects/{projectId}?sharing=true";
                additionalMessage = "This link can be shared with others so they can join the project too.";
            }
            else if ((project.CheckingConfig.ShareEnabled
                && project.CheckingConfig.ShareLevel == CheckingShareLevel.Specific)
                    || IsProjectAdmin(project, curUserId))
            {
                // Invite a specific person
                // Reuse prior code, if any
                SFProjectSecret projectSecret = await ProjectSecrets.UpdateAsync(
                    p => p.Id == projectId && !p.ShareKeys.Any(sk => sk.Email == email),
                    update => update.Add(p => p.ShareKeys,
                        new ShareKey { Email = email, Key = _securityService.GenerateKey() }));
                if (projectSecret == null)
                    projectSecret = await ProjectSecrets.GetAsync(projectId);
                string key = projectSecret.ShareKeys.Single(sk => sk.Email == email).Key;
                url = $"{siteOptions.Origin}projects/{projectId}?sharing=true&shareKey={key}";
                additionalMessage = "This link will only work for this email address.";
            }
            else
            {
                throw new ForbiddenException();
            }

            User inviter = await RealtimeService.GetSnapshotAsync<User>(curUserId);
            string subject = $"You've been invited to the project {project.Name} on {siteOptions.Name}";
            string body = "<p>Hello,</p><p></p>" +
                $"<p>{inviter.Name} invites you to join the {project.Name} project on {siteOptions.Name}." +
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

        /// <summary>Cancel an outstanding project invitation.</summary>
        public async Task UninviteUserAsync(string curUserId, string projectId, string emailToUninvite)
        {
            SFProject project = await GetProjectAsync(projectId);
            if (!IsProjectAdmin(project, curUserId))
                throw new ForbiddenException();

            if (!await IsAlreadyInvitedAsync(curUserId, projectId, emailToUninvite))
            {
                // There is not an invitation for this email address
                return;
            }

            await ProjectSecrets.UpdateAsync(projectId, u =>
            {
                u.RemoveAll(secretSet => secretSet.ShareKeys, shareKey => shareKey.Email == (emailToUninvite));
            });
        }

        /// <summary>Is there already a pending invitation to the project for the specified email address?</summary>
        public async Task<bool> IsAlreadyInvitedAsync(string curUserId, string projectId, string email)
        {
            SFProject project = await GetProjectAsync(projectId);
            if (!IsProjectAdmin(project, curUserId) && !project.CheckingConfig.ShareEnabled)
                throw new ForbiddenException();

            if (email == null)
                return false;
            return await ProjectSecrets.Query()
                .AnyAsync(p => p.Id == projectId && p.ShareKeys.Any(sk => sk.Email == email));
        }

        /// <summary>Return list of email addresses with outstanding invitations</summary>
        public async Task<string[]> InvitedUsersAsync(string curUserId, string projectId)
        {
            SFProject project = await GetProjectAsync(projectId);

            if (!IsProjectAdmin(project, curUserId))
                throw new ForbiddenException();

            SFProjectSecret projectSecret = await ProjectSecrets.GetAsync(projectId);

            return projectSecret.ShareKeys.Select(sk => sk.Email).ToArray();
        }

        public async Task CheckLinkSharingAsync(string curUserId, string projectId, string shareKey = null)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);

                if (!projectDoc.Data.CheckingConfig.ShareEnabled)
                    throw new ForbiddenException();

                if (projectDoc.Data.CheckingConfig.ShareLevel != CheckingShareLevel.Anyone
                    && projectDoc.Data.CheckingConfig.ShareLevel != CheckingShareLevel.Specific)
                {
                    throw new ForbiddenException();
                }

                if (projectDoc.Data.UserRoles.ContainsKey(curUserId))
                    return;

                IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
                Attempt<string> attempt = await TryGetProjectRoleAsync(projectDoc.Data, curUserId);
                string projectRole = attempt.Result;
                if (projectDoc.Data.CheckingConfig.ShareLevel == CheckingShareLevel.Specific)
                {
                    string currentUserEmail = userDoc.Data.Email;
                    SFProjectSecret projectSecret = await ProjectSecrets.UpdateAsync(
                        p => p.Id == projectId
                            && p.ShareKeys.Any(sk => sk.Email == currentUserEmail && sk.Key == shareKey),
                        update => update.RemoveAll(p => p.ShareKeys, sk => sk.Email == currentUserEmail));
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

        protected override async Task AddUserToProjectAsync(IConnection conn, IDocument<SFProject> projectDoc,
            IDocument<User> userDoc, string projectRole)
        {
            await base.AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole);
            IDocument<SFProjectUserConfig> projectUserConfigDoc = await conn.CreateAsync<SFProjectUserConfig>(
                SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id),
                new SFProjectUserConfig { ProjectRef = projectDoc.Id, OwnerRef = userDoc.Id });
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

            return Attempt.Failure(SFProjectRole.CommunityChecker);
        }

        private static void UpdateSetting<T>(Json0OpBuilder<SFProject> builder, Expression<Func<SFProject, T>> field,
            T setting)
        {
            if (setting != null)
                builder.Set(field, setting);
        }
    }
}
