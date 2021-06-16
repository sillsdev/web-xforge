using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Localization;
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
        public static readonly string ErrorAlreadyConnectedKey = "error-already-connected";
        private readonly IEngineService _engineService;
        private readonly ISyncService _syncService;
        private readonly IParatextService _paratextService;
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IRepository<TranslateMetrics> _translateMetrics;
        private readonly IEmailService _emailService;
        private readonly ISecurityService _securityService;
        private readonly IStringLocalizer<SharedResource> _localizer;
        private readonly ITransceleratorService _transceleratorService;

        public SFProjectService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions,
            IAudioService audioService, IEmailService emailService, IRepository<SFProjectSecret> projectSecrets,
            ISecurityService securityService, IFileSystemService fileSystemService, IEngineService engineService,
            ISyncService syncService, IParatextService paratextService, IRepository<UserSecret> userSecrets,
            IRepository<TranslateMetrics> translateMetrics, IStringLocalizer<SharedResource> localizer,
            ITransceleratorService transceleratorService)
            : base(realtimeService, siteOptions, audioService, projectSecrets, fileSystemService)
        {
            _engineService = engineService;
            _syncService = syncService;
            _paratextService = paratextService;
            _userSecrets = userSecrets;
            _translateMetrics = translateMetrics;
            _emailService = emailService;
            _securityService = securityService;
            _localizer = localizer;
            _transceleratorService = transceleratorService;
        }

        protected override string ProjectAdminRole => SFProjectRole.Administrator;

        /// <summary>
        /// Returns SF project id of created project.
        /// </summary>
        public async Task<string> CreateProjectAsync(string curUserId, SFProjectCreateSettings settings)
        {
            Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
            if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                throw new DataNotFoundException("The user does not exist.");

            IReadOnlyList<ParatextProject> ptProjects = await _paratextService.GetProjectsAsync(userSecret);

            ParatextProject ptProject = ptProjects.SingleOrDefault(p => p.ParatextId == settings.ParatextId);
            if (ptProject == null)
                throw new DataNotFoundException("The paratext project does not exist.");

            var project = new SFProject
            {
                ParatextId = settings.ParatextId,
                Name = ptProject.Name,
                ShortName = ptProject.ShortName,
                WritingSystem = new WritingSystem { Tag = ptProject.LanguageTag },
                TranslateConfig = new TranslateConfig
                {
                    TranslationSuggestionsEnabled = settings.TranslationSuggestionsEnabled
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
                if (this.RealtimeService.QuerySnapshots<SFProject>().Any(
                    (SFProject sfProject) => sfProject.ParatextId == project.ParatextId))
                {
                    throw new InvalidOperationException(ErrorAlreadyConnectedKey);
                }
                IDocument<SFProject> projectDoc = await conn.CreateAsync<SFProject>(projectId, project);
                await ProjectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id });

                IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
                await AddUserToProjectAsync(conn, projectDoc, userDoc, SFProjectRole.Administrator, false);

                // Add the source after the project has been created
                // This will make the source project appear after the target, if it needs to be created
                if (settings.SourceParatextId != null && settings.SourceParatextId != settings.ParatextId)
                {
                    TranslateSource source = await this.GetTranslateSourceAsync(
                        curUserId, userSecret, settings.SourceParatextId, ptProjects);

                    await projectDoc.SubmitJson0OpAsync(op =>
                    {
                        UpdateSetting(op, p => p.TranslateConfig.Source, source);
                    });
                }

                if (projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled)
                {
                    var machineProject = new MachineProject
                    {
                        Id = projectDoc.Id,
                        SourceLanguageTag = projectDoc.Data.TranslateConfig.Source.WritingSystem.Tag,
                        TargetLanguageTag = projectDoc.Data.WritingSystem.Tag
                    };
                    await _engineService.AddProjectAsync(machineProject);
                }
            }

            await _syncService.SyncAsync(curUserId, projectId, true);
            return projectId;
        }

        /// <summary>
        /// Asynchronously creates a project for a Paratext resource.
        /// </summary>
        /// <param name="curUserId">The current user identifier.</param>
        /// <param name="paratextId">The paratext resource identifier.</param>
        /// <returns>SF project id of created project</returns>
        /// <remarks>
        /// This method will also work for a source project that has been deleted for some reason.
        /// </remarks>
        /// <exception cref="DataNotFoundException">
        /// The user does not exist.
        /// or
        /// The paratext project does not exist.
        /// </exception>
        /// <exception cref="InvalidOperationException"></exception>
        public async Task<string> CreateResourceProjectAsync(string curUserId, string paratextId)
        {
            Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
            if (!userSecretAttempt.TryResult(out UserSecret userSecret))
            {
                throw new DataNotFoundException("The user does not exist.");
            }

            // We check projects first, in case it is a project
            IReadOnlyList<ParatextProject> ptProjects = await _paratextService.GetProjectsAsync(userSecret);
            ParatextProject ptProject = ptProjects.SingleOrDefault(p => p.ParatextId == paratextId);
            if (ptProject == null)
            {
                // If it is not a project, see if there is a matching resource
                IReadOnlyList<ParatextResource> resources = await this._paratextService.GetResourcesAsync(curUserId);
                ptProject = resources.SingleOrDefault(r => r.ParatextId == paratextId);
                if (ptProject == null)
                {
                    throw new DataNotFoundException("The paratext project or resource does not exist.");
                }
            }

            return await CreateResourceProjectInternalAsync(curUserId, ptProject);
        }

        public async Task DeleteProjectAsync(string curUserId, string projectId)
        {
            // Cancel any jobs before we delete
            await _syncService.CancelSyncAsync(curUserId, projectId);

            string ptProjectId;
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, curUserId))
                    throw new ForbiddenException();

                ptProjectId = projectDoc.Data.ParatextId;
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

                string[] referringProjects = GetProjectWithReferenceToSource(projectId);
                async Task removeSourceReference(string projectId)
                {
                    IDocument<SFProject> doc = await conn.FetchAsync<SFProject>(projectId);
                    await doc.SubmitJson0OpAsync(op => op.Unset(d => d.TranslateConfig.Source));
                }
                foreach (string projId in referringProjects)
                    tasks.Add(removeSourceReference(projId));
                await Task.WhenAll(tasks);
            }

            await ProjectSecrets.DeleteAsync(projectId);
            await RealtimeService.DeleteProjectAsync(projectId);
            await _engineService.RemoveProjectAsync(projectId);
            string projectDir = Path.Combine(SiteOptions.Value.SiteDir, "sync", ptProjectId);
            if (FileSystemService.DirectoryExists(projectDir))
                FileSystemService.DeleteDirectory(projectDir);
            string audioDir = GetAudioDir(projectId);
            if (FileSystemService.DirectoryExists(audioDir))
                FileSystemService.DeleteDirectory(audioDir);
        }

        public async Task UpdateSettingsAsync(string curUserId, string projectId, SFProjectSettings settings)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                if (!IsProjectAdmin(projectDoc.Data, curUserId))
                    throw new ForbiddenException();

                // Get the source - any creation or permission updates are handled in GetTranslateSourceAsync
                TranslateSource source = null;
                if (settings.SourceParatextId != null)
                {
                    Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
                    if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                        throw new DataNotFoundException("The user does not exist.");

                    IReadOnlyList<ParatextProject> ptProjects = await _paratextService.GetProjectsAsync(userSecret);
                    source = await GetTranslateSourceAsync(curUserId, userSecret, settings.SourceParatextId,
                        ptProjects, projectDoc.Data.UserRoles);
                    if (source.ProjectRef == projectId)
                    {
                        // A project cannot reference itself
                        source = null;
                    }
                }

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
                                SourceLanguageTag = projectDoc.Data.TranslateConfig.Source.WritingSystem.Tag,
                                TargetLanguageTag = projectDoc.Data.WritingSystem.Tag
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

        public async Task CancelSyncAsync(string curUserId, string projectId)
        {
            Attempt<SFProject> attempt = await RealtimeService.TryGetSnapshotAsync<SFProject>(projectId);
            if (!attempt.TryResult(out SFProject project))
                throw new DataNotFoundException("The project does not exist.");

            if (!IsProjectAdmin(project, curUserId))
                throw new ForbiddenException();

            await _syncService.CancelSyncAsync(curUserId, projectId);
        }

        public async Task<bool> InviteAsync(string curUserId, string projectId, string email, string locale,
            string role)
        {
            SFProject project = await GetProjectAsync(projectId);
            if (await RealtimeService.QuerySnapshots<User>()
                .AnyAsync(u => project.UserRoles.Keys.Contains(u.Id) && u.Email == email))
            {
                return false;
            }
            SiteOptions siteOptions = SiteOptions.Value;

            if (!project.CheckingConfig.ShareEnabled && !IsProjectAdmin(project, curUserId))
            {
                throw new ForbiddenException();
            }
            CultureInfo.CurrentUICulture = new CultureInfo(locale);
            // Remove the user sharekey if expired
            await ProjectSecrets.UpdateAsync(
                p => p.Id == projectId,
                update => update.RemoveAll(p => p.ShareKeys,
                    sk => sk.Email == email && sk.ExpirationTime < DateTime.UtcNow)
            );
            DateTime expTime = DateTime.UtcNow.AddDays(14);

            // Invite a specific person. Reuse prior code, if any.
            SFProjectSecret projectSecret = await ProjectSecrets.UpdateAsync(
                p => p.Id == projectId && !p.ShareKeys.Any(sk => sk.Email == email),
                update => update.Add(p => p.ShareKeys,
                    new ShareKey
                    {
                        Email = email,
                        Key = _securityService.GenerateKey(),
                        ExpirationTime = expTime,
                        ProjectRole = role
                    }
                )
            );
            if (projectSecret == null)
            {
                projectSecret = await ProjectSecrets.GetAsync(projectId);
                int index = projectSecret.ShareKeys.FindIndex(sk => sk.Email == email);

                // Renew the expiration time of the valid key
                await ProjectSecrets.UpdateAsync(
                    p => p.Id == projectId && p.ShareKeys.Any(sk => sk.Email == email),
                    update => update.Set(p => p.ShareKeys[index].ExpirationTime, expTime)
                                    .Set(p => p.ShareKeys[index].ProjectRole, role)
                );
            }
            string key = projectSecret.ShareKeys.Single(sk => sk.Email == email).Key;
            string url = $"{siteOptions.Origin}projects/{projectId}?sharing=true&shareKey={key}&locale={locale}";
            string linkExpires = _localizer[SharedResource.Keys.InviteLinkExpires];

            User inviter = await RealtimeService.GetSnapshotAsync<User>(curUserId);
            string subject = _localizer[SharedResource.Keys.InviteSubject, project.Name, siteOptions.Name];
            var greeting = $"<p>{_localizer[SharedResource.Keys.InviteGreeting, "<p>", inviter.Name, project.Name, siteOptions.Name, $"<a href=\"{url}\">{url}</a><p>"]}";
            var instructions = $"<p>{_localizer[SharedResource.Keys.InviteInstructions, siteOptions.Name, "<b>", "</b>"]}";
            var pt = $"<ul><li>{_localizer[SharedResource.Keys.InvitePTOption, "<b>", "</b>", siteOptions.Name]}</li>";
            var google = $"<li>{_localizer[SharedResource.Keys.InviteGoogleOption, "<b>", "</b>", siteOptions.Name]}</li>";
            var facebook = $"<li>{_localizer[SharedResource.Keys.InviteFacebookOption, "<b>", "</b>", siteOptions.Name]}</li>";
            var withemail = $"<li>{_localizer[SharedResource.Keys.InviteEmailOption, siteOptions.Name]}</li></ul></p><p></p>";
            var signoff = $"<p>{_localizer[SharedResource.Keys.InviteSignature, "<p>", siteOptions.Name]}</p>";
            var emailBody = $"{greeting}{linkExpires}{instructions}{pt}{google}{facebook}{withemail}{signoff}";
            await _emailService.SendEmailAsync(email, subject, emailBody);
            return true;
        }

        /// <summary> Get the link sharing key for a project if it exists, otherwise create a new one. </summary>
        public async Task<string> GetLinkSharingKeyAsync(string projectId, string role)
        {
            SFProject project = await GetProjectAsync(projectId);
            if (!(project.CheckingConfig.ShareEnabled && project.CheckingConfig.ShareLevel == CheckingShareLevel.Anyone))
                return null;
            SFProjectSecret projectSecret = await ProjectSecrets.GetAsync(projectId);
            // Link sharing keys have Email set to null and ExpirationTime set to null.
            string key = projectSecret.ShareKeys.SingleOrDefault(
                sk => sk.Email == null && sk.ProjectRole == role)?.Key;
            if (!string.IsNullOrEmpty(key))
                return key;

            // Generate a new link sharing key for the given role
            key = _securityService.GenerateKey();
            await ProjectSecrets.UpdateAsync(p => p.Id == projectId,
                update => update.Add(p => p.ShareKeys,
                new ShareKey
                {
                    Key = key,
                    ProjectRole = role,
                    ExpirationTime = null
                }
            ));
            return key;
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
        public async Task<IReadOnlyList<InviteeStatus>> InvitedUsersAsync(string curUserId, string projectId)
        {
            SFProject project = await GetProjectAsync(projectId);

            if (!IsProjectAdmin(project, curUserId))
                throw new ForbiddenException();

            SFProjectSecret projectSecret = await ProjectSecrets.GetAsync(projectId);

            DateTime now = DateTime.UtcNow;
            return projectSecret.ShareKeys.Where(s => s.Email != null).Select(sk =>
                new InviteeStatus { Email = sk.Email, Role = sk.ProjectRole, Expired = sk.ExpirationTime < now }).ToArray();
        }

        /// <summary> Check that a share link is valid for a project and add the user to the project. </summary>
        public async Task CheckLinkSharingAsync(string curUserId, string projectId, string shareKey)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);
                if (projectDoc.Data.UserRoles.ContainsKey(curUserId))
                    return;

                IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
                string projectRole;
                // Attempt to get the role for the user from the Paratext registry
                Attempt<string> attempt = await TryGetProjectRoleAsync(projectDoc.Data, curUserId);
                if (!attempt.TryResult(out projectRole))
                {
                    // Get the project role that is specified in the sharekey
                    Attempt<SFProjectSecret> psAttempt = await ProjectSecrets.TryGetAsync(projectId);
                    if (psAttempt.TryResult(out SFProjectSecret ps))
                        projectRole = ps.ShareKeys.SingleOrDefault(sk => sk.Key == shareKey)?.ProjectRole;
                }
                // The share key was invalid
                if (projectRole == null)
                    throw new ForbiddenException();

                bool linkSharing = projectDoc.Data.CheckingConfig.ShareEnabled &&
                    projectDoc.Data.CheckingConfig.ShareLevel == CheckingShareLevel.Anyone;
                if (linkSharing)
                {
                    // Add the user and remove the specific user share key if it exists. Link sharing keys
                    // have Email set to null and will not be removed.
                    await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole, true);
                    return;
                }
                // Look for a valid specific user share key.
                SFProjectSecret projectSecret = await ProjectSecrets.UpdateAsync(
                    p => p.Id == projectId && p.ShareKeys.Any(
                        sk => sk.Email != null && sk.Key == shareKey && sk.ExpirationTime > DateTime.UtcNow),
                    update => update.RemoveAll(p => p.ShareKeys, sk => sk.Key == shareKey)
                );
                if (projectSecret != null)
                {
                    await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole, false);
                    return;
                }
                throw new ForbiddenException();
            }
        }

        /// <summary> Determine if the specified project is an active source project. </summary>
        public bool IsSourceProject(string projectId)
        {
            IQueryable<SFProject> projectQuery = RealtimeService.QuerySnapshots<SFProject>();
            return projectQuery.Any(p =>
                p.TranslateConfig.Source != null &&
                p.TranslateConfig.Source.ProjectRef == projectId &&
                p.TranslateConfig.TranslationSuggestionsEnabled
            );
        }

        public async Task<IEnumerable<TransceleratorQuestion>> TransceleratorQuestions(string curUserId, string projectId)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                // TODO Checking whether the permissions contains a particular string is not a very robust way to check
                // permissions. A rights service needs to be created in C# land.
                if (!IsProjectAdmin(projectDoc.Data, curUserId) && !projectDoc.Data.UserPermissions[curUserId].Contains("questions.create"))
                    throw new ForbiddenException();
                return _transceleratorService.Questions(projectDoc.Data.ParatextId);
            }
        }

        public async Task<bool> HasTransceleratorQuestions(string curUserId, string projectId)
        {
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (!projectDoc.IsLoaded)
                    throw new DataNotFoundException("The project does not exist.");
                // TODO Checking whether the permissions contains a particular string is not a very robust way to check
                // permissions. A rights service needs to be created in C# land.
                if (!IsProjectAdmin(projectDoc.Data, curUserId) && !projectDoc.Data.UserPermissions[curUserId].Contains("questions.create"))
                    throw new ForbiddenException();
                return _transceleratorService.HasQuestions(projectDoc.Data.ParatextId);
            }
        }

        protected override async Task AddUserToProjectAsync(IConnection conn, IDocument<SFProject> projectDoc,
            IDocument<User> userDoc, string projectRole, bool removeShareKeys = true)
        {
            await conn.CreateAsync<SFProjectUserConfig>(SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id),
                new SFProjectUserConfig { ProjectRef = projectDoc.Id, OwnerRef = userDoc.Id });
            // Listeners can now assume the ProjectUserConfig is ready when the user is added.
            await base.AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole, removeShareKeys);

            // Update book and chapter permissions on SF project/resource, but only if user
            // has a role on the PT project or permissions to the DBL resource. These permissions are needed
            // in order to query the PT roles and DBL permissions of other SF project/resource users.
            if ((await TryGetProjectRoleAsync(projectDoc.Data, userDoc.Id)).Success)
            {
                await UpdatePermissionsAsync(userDoc.Id, projectDoc, CancellationToken.None);
            }

            // Add to the source project, if required
            bool translationSuggestionsEnabled = projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled;
            string sourceProjectId = projectDoc.Data.TranslateConfig.Source?.ProjectRef;
            string sourceParatextId = projectDoc.Data.TranslateConfig.Source?.ParatextId;
            if (translationSuggestionsEnabled
                && !string.IsNullOrWhiteSpace(sourceProjectId)
                && !string.IsNullOrWhiteSpace(sourceParatextId))
            {
                // Load the source project role from MongoDB
                IDocument<SFProject> sourceProjectDoc = await TryGetProjectDocAsync(sourceProjectId, conn);
                if (sourceProjectDoc == null)
                    return;
                if (sourceProjectDoc.IsLoaded && !sourceProjectDoc.Data.UserRoles.ContainsKey(userDoc.Id))
                {
                    // Not found in Mongo, so load the project role from Paratext
                    Attempt<string> attempt = await TryGetProjectRoleAsync(sourceProjectDoc.Data, userDoc.Id);
                    if (attempt.TryResult(out string sourceProjectRole))
                    {
                        // If they are in Paratext, add the user to the source project
                        await this.AddUserToProjectAsync(conn, sourceProjectDoc, userDoc, sourceProjectRole,
                            removeShareKeys);
                    }
                }
            }
        }

        /// <summary>
        /// Update all user permissions on books and chapters in an SF project, from PT project permissions. For Paratext
        /// projects, permissions are acquired from ScrText objects, and so presumably only what was received from
        /// Paratext in the last synchronize. For Resources, permissions are fetched from a DBL server, and so permissions
        /// may be ahead of the last sync.
        /// Note that this method is not necessarily applying permissions for user `curUserId`, but rather using that
        /// user to perform PT queries and set values in the SF DB.
        /// </summary>
        public async Task UpdatePermissionsAsync(string curUserId, IDocument<SFProject> projectDoc, CancellationToken token)
        {
            Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
            if (!userSecretAttempt.TryResult(out UserSecret userSecret))
            {
                throw new DataNotFoundException("No matching user secrets found.");
            }

            string paratextId = projectDoc.Data.ParatextId;
            HashSet<int> booksInProject = new HashSet<int>(_paratextService.GetBookList(userSecret, paratextId));
            IReadOnlyDictionary<string, string> ptUsernameMapping =
                await _paratextService.GetParatextUsernameMappingAsync(userSecret, paratextId, token);
            bool isResource = _paratextService.IsResource(paratextId);
            // Place to collect all chapter permissions to record in the project.
            var projectChapterPermissions =
                new List<(int bookIndex, int chapterIndex, Dictionary<string, string> chapterPermissions)>();
            // Place to collect all book permissions to record in the project.
            var projectBookPermissions = new List<(int bookIndex, Dictionary<string, string> bookPermissions)>();

            Dictionary<string, string> resourcePermissions = null;
            if (isResource)
            {
                // Note that DBL specifies permission for a resource with granularity of the whole resource. We will
                // write in the SF DB that whole-resource permission but on each book and chapter.
                resourcePermissions =
                    await _paratextService.GetPermissionsAsync(userSecret, projectDoc.Data, ptUsernameMapping, 0, 0, token);
            }

            foreach (int bookNum in booksInProject)
            {
                int textIndex = projectDoc.Data.Texts.FindIndex(t => t.BookNum == bookNum);
                if (textIndex == -1)
                {
                    // Project does not contain specified book.
                    // This is expected if a user is connecting a project for the first time, as the project may not
                    // have been synchronized yet.
                    continue;
                }
                Models.TextInfo text = projectDoc.Data.Texts[textIndex];
                List<Chapter> chapters = text.Chapters;
                Dictionary<string, string> bookPermissions = null;
                IEnumerable<(int bookIndex, int chapterIndex, Dictionary<string, string> chapterPermissions)>
                    chapterPermissionsInBook = null;

                if (isResource)
                {
                    bookPermissions = resourcePermissions;
                    // Prepare to write the same resource permission for each chapter in the book/text.
                    chapterPermissionsInBook = chapters.Select(
                        (Chapter chapter, int chapterIndex) => (textIndex, chapterIndex, bookPermissions));
                }
                else
                {
                    bookPermissions = await _paratextService.GetPermissionsAsync(userSecret, projectDoc.Data,
                        ptUsernameMapping, bookNum, 0, token);

                    // Get the project permissions for the chapters
                    chapterPermissionsInBook = await Task.WhenAll(chapters.Select(
                        async (Chapter chapter, int chapterIndex) =>
                        {
                            Dictionary<string, string> chapterPermissions = await _paratextService.GetPermissionsAsync(
                                userSecret, projectDoc.Data, ptUsernameMapping, bookNum, chapter.Number, token);
                            return (textIndex, chapterIndex, chapterPermissions);
                        }
                    ));
                }
                projectChapterPermissions.AddRange(chapterPermissionsInBook);
                projectBookPermissions.Add((textIndex, bookPermissions));
            }

            // Update project metadata
            await projectDoc.SubmitJson0OpAsync(op =>
            {
                foreach ((int bookIndex, Dictionary<string, string> bookPermissions) in projectBookPermissions)
                {
                    op.Set(pd => pd.Texts[bookIndex].Permissions, bookPermissions,
                        ParatextSyncRunner.PermissionDictionaryEqualityComparer);
                }
                foreach ((int bookIndex, int chapterIndex, Dictionary<string, string> chapterPermissions)
                    in projectChapterPermissions)
                {
                    op.Set(pd => pd.Texts[bookIndex].Chapters[chapterIndex].Permissions, chapterPermissions);
                }
            });
        }

        protected override async Task RemoveUserFromProjectAsync(IConnection conn, IDocument<SFProject> projectDoc,
            IDocument<User> userDoc)
        {
            await base.RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
            IDocument<SFProjectUserConfig> projectUserConfigDoc = await conn.FetchAsync<SFProjectUserConfig>(
                SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id));
            await projectUserConfigDoc.DeleteAsync();
        }

        /// <summary>
        /// Returns `userId`'s role on project or resource `project`.
        /// The role may be the PT role from PT Registry, or a SF role.
        /// The returned Attempt will be Success if they have a non-None role, or otherwise Failure.
        /// </summary>
        protected async override Task<Attempt<string>> TryGetProjectRoleAsync(SFProject project, string userId)
        {
            Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(userId);
            if (userSecretAttempt.TryResult(out UserSecret userSecret))
            {
                if (_paratextService.IsResource(project.ParatextId))
                {
                    // If the project is a resource, get the permission from the DBL
                    string permission = await _paratextService.GetResourcePermissionAsync(project.ParatextId, userId,
                        CancellationToken.None);
                    return permission switch
                    {
                        TextInfoPermission.None => Attempt.Failure(ProjectRole.None),
                        TextInfoPermission.Read => Attempt.Success(SFProjectRole.Observer),
                        _ => throw new ArgumentException($"Unknown resource permission: '{permission}'",
                            nameof(permission)),
                    };
                }
                else
                {
                    Attempt<string> roleAttempt = await _paratextService.TryGetProjectRoleAsync(userSecret,
                        project.ParatextId, CancellationToken.None);
                    if (roleAttempt.TryResult(out string role))
                    {
                        return Attempt.Success(role);
                    }
                }
            }

            return Attempt.Failure(ProjectRole.None);
        }

        private async Task<IDocument<SFProject>> TryGetProjectDocAsync(string projectId, IConnection conn)
        {
            try
            {
                IDocument<SFProject> projectDoc = await base.GetProjectDocAsync(projectId, conn);
                return projectDoc;
            }
            catch (DataNotFoundException)
            {
                return null;
            }
        }

        private static void UpdateSetting<T>(Json0OpBuilder<SFProject> builder, Expression<Func<SFProject, T>> field,
            T setting)
        {
            if (setting != null)
                builder.Set(field, setting);
        }

        /// <summary>
        /// Asynchronously creates a Scripture Forge project from Paratext resource/project.
        /// </summary>
        /// <param name="curUserId">The current user identifier.</param>
        /// <param name="ptProject">The paratext project.</param>
        /// <returns>SF project id of created project</returns>
        /// <remarks>
        /// This method will also work for a source project that has been deleted for some reason.
        /// </remarks>
        /// <exception cref="InvalidOperationException"></exception>
        private async Task<string> CreateResourceProjectInternalAsync(string curUserId, ParatextProject ptProject)
        {
            var project = new SFProject
            {
                ParatextId = ptProject.ParatextId,
                Name = ptProject.Name,
                ShortName = ptProject.ShortName,
                WritingSystem = new WritingSystem { Tag = ptProject.LanguageTag },
                TranslateConfig = new TranslateConfig
                {
                    TranslationSuggestionsEnabled = false,
                    Source = null
                },
                CheckingConfig = new CheckingConfig
                {
                    CheckingEnabled = false
                }
            };

            // Create the new project using the realtime service
            string projectId = ObjectId.GenerateNewId().ToString();
            using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
            {
                if (this.RealtimeService.QuerySnapshots<SFProject>().Any(
                    (SFProject sfProject) => sfProject.ParatextId == project.ParatextId))
                {
                    throw new InvalidOperationException(ErrorAlreadyConnectedKey);
                }
                IDocument<SFProject> projectDoc = await conn.CreateAsync(projectId, project);
                await ProjectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id });

                // Resource projects do not have administrators, so users are added as needed
            }

            return projectId;
        }

        /// <summary>
        /// Gets the translate source asynchronously.
        /// </summary>
        /// <param name="curUserId">The current user identifier.</param>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="paratextId">The paratext identifier.</param>
        /// <param name="ptProjects">The paratext projects.</param>
        /// <param name="userIds">The ids and roles of the users who will need to access the source.</param>
        /// <returns>The <see cref="TranslateSource"/> object for the specified resource.</returns>
        /// <exception cref="DataNotFoundException">The source paratext project does not exist.</exception>
        private async Task<TranslateSource> GetTranslateSourceAsync(string curUserId, UserSecret userSecret,
            string paratextId, IReadOnlyList<ParatextProject> ptProjects,
            IReadOnlyDictionary<string, string> userRoles = null)
        {
            ParatextProject sourcePTProject = ptProjects.SingleOrDefault(p => p.ParatextId == paratextId);
            string sourceProjectRef = null;
            if (sourcePTProject == null)
            {
                // If it is not a project, see if there is a matching resource
                IReadOnlyList<ParatextResource> resources = await this._paratextService.GetResourcesAsync(curUserId);
                sourcePTProject = resources.SingleOrDefault(r => r.ParatextId == paratextId);
                if (sourcePTProject == null)
                {
                    throw new DataNotFoundException("The source paratext project does not exist.");
                }
            }

            // Get the users who will access this source resource or project
            IEnumerable<string> userIds = userRoles != null ? userRoles.Keys : new string[] { curUserId };

            // Get the project reference
            SFProject sourceProject = RealtimeService.QuerySnapshots<SFProject>()
               .FirstOrDefault(p => p.ParatextId == paratextId);
            if (sourceProject != null)
            {
                sourceProjectRef = sourceProject.Id;
            }
            else
            {
                sourceProjectRef = await this.CreateResourceProjectAsync(curUserId, paratextId);
            }

            // Add each user in the target project to the source project so they can access it
            foreach (string userId in userIds)
            {
                try
                {
                    // Add the user to the project, if the user does not have a role in it
                    if (sourceProject == null || !sourceProject.UserRoles.ContainsKey(userId))
                    {
                        await this.AddUserAsync(userId, sourceProjectRef, null);
                    }
                }
                catch (ForbiddenException)
                {
                    // The user does not have Paratext access
                }
            }

            return new TranslateSource
            {
                ParatextId = paratextId,
                ProjectRef = sourceProjectRef,
                Name = sourcePTProject.Name,
                ShortName = sourcePTProject.ShortName,
                WritingSystem = new WritingSystem { Tag = sourcePTProject.LanguageTag }
            };
        }

        private string[] GetProjectWithReferenceToSource(string projectId)
        {
            if (string.IsNullOrEmpty(projectId))
                return new string[0];
            IQueryable<SFProject> projectQuery = RealtimeService.QuerySnapshots<SFProject>();
            return projectQuery
                .Where(p => p.TranslateConfig.Source != null && p.TranslateConfig.Source.ProjectRef == projectId)
                .Select(p => p.Id)
                .ToArray();
        }
    }
}
