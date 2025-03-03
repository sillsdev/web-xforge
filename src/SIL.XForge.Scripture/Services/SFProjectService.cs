using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using Newtonsoft.Json.Linq;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// This class manages SF projects.
/// </summary>
public class SFProjectService : ProjectService<SFProject, SFProjectSecret>, ISFProjectService
{
    public const string ErrorAlreadyConnectedKey = "error-already-connected";
    internal const string ProjectSettingValueUnset = "unset";
    private static readonly IEqualityComparer<Dictionary<string, string>> _permissionDictionaryEqualityComparer =
        new DictionaryComparer<string, string>();
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly ILogger<SFProjectService> _logger;
    private readonly IMachineProjectService _machineProjectService;
    private readonly ISyncService _syncService;
    private readonly IParatextService _paratextService;
    private readonly IRepository<UserSecret> _userSecrets;
    private readonly IRepository<TranslateMetrics> _translateMetrics;
    private readonly IEmailService _emailService;
    private readonly ISecurityService _securityService;
    private readonly IStringLocalizer<SharedResource> _localizer;
    private readonly ITransceleratorService _transceleratorService;
    private readonly IEventMetricService _eventMetricService;
    private readonly ISFProjectRights _projectRights;

    public SFProjectService(
        IRealtimeService realtimeService,
        IOptions<SiteOptions> siteOptions,
        IAudioService audioService,
        IEmailService emailService,
        IRepository<SFProjectSecret> projectSecrets,
        ISecurityService securityService,
        IFileSystemService fileSystemService,
        ILogger<SFProjectService> logger,
        IMachineProjectService machineProjectService,
        ISyncService syncService,
        IParatextService paratextService,
        IRepository<UserSecret> userSecrets,
        IRepository<TranslateMetrics> translateMetrics,
        IStringLocalizer<SharedResource> localizer,
        ITransceleratorService transceleratorService,
        IBackgroundJobClient backgroundJobClient,
        IEventMetricService eventMetricService,
        ISFProjectRights projectRights
    )
        : base(realtimeService, siteOptions, audioService, projectSecrets, fileSystemService)
    {
        _logger = logger;
        _machineProjectService = machineProjectService;
        _syncService = syncService;
        _paratextService = paratextService;
        _userSecrets = userSecrets;
        _translateMetrics = translateMetrics;
        _emailService = emailService;
        _securityService = securityService;
        _localizer = localizer;
        _transceleratorService = transceleratorService;
        _eventMetricService = eventMetricService;
        _backgroundJobClient = backgroundJobClient;
        _projectRights = projectRights;
    }

    protected override string ProjectAdminRole => SFProjectRole.Administrator;

    /// <summary>
    /// Returns SF project id of created project.
    /// </summary>
    public async Task<string> CreateProjectAsync(IUserAccessor userAccessor, SFProjectCreateSettings settings)
    {
        Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(userAccessor.UserId);
        if (!userSecretAttempt.TryResult(out UserSecret userSecret))
            throw new DataNotFoundException("The user does not exist.");

        string projectDir = Path.Combine(SiteOptions.Value.SiteDir, "sync", settings.ParatextId);
        if (FileSystemService.DirectoryExists(projectDir))
            throw new InvalidOperationException("A directory for this project already exists.");

        IReadOnlyList<ParatextProject> ptProjects = await _paratextService.GetProjectsAsync(userSecret);

        ParatextProject ptProject =
            ptProjects.SingleOrDefault(p => p.ParatextId == settings.ParatextId)
            ?? throw new DataNotFoundException("The paratext project does not exist.");

        var project = new SFProject
        {
            IsRightToLeft = ptProject.IsRightToLeft,
            ParatextId = settings.ParatextId,
            Name = ptProject.Name,
            ShortName = ptProject.ShortName,
            WritingSystem = new WritingSystem
            {
                Region = ptProject.LanguageRegion,
                Script = ptProject.LanguageScript,
                Tag = ptProject.LanguageTag,
            },
            TranslateConfig = new TranslateConfig { TranslationSuggestionsEnabled = false },
            CheckingConfig = new CheckingConfig
            {
                CheckingEnabled = settings.CheckingEnabled,
                AnswerExportMethod = settings.AnswerExportMethod,
            },
        };
        Attempt<string> attempt = await TryGetProjectRoleAsync(project, userAccessor.UserId);
        if (!attempt.TryResult(out string projectRole) || projectRole != SFProjectRole.Administrator)
            throw new ForbiddenException();

        string projectId = ObjectId.GenerateNewId().ToString();
        await using (IConnection conn = await RealtimeService.ConnectAsync(userAccessor.UserId))
        {
            if (
                this
                    .RealtimeService.QuerySnapshots<SFProject>()
                    .Any((SFProject sfProject) => sfProject.ParatextId == project.ParatextId)
            )
            {
                throw new InvalidOperationException(ErrorAlreadyConnectedKey);
            }
            IDocument<SFProject> projectDoc = await conn.CreateAsync<SFProject>(projectId, project);
            await ProjectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id });

            IDocument<User> userDoc = await conn.FetchAsync<User>(userAccessor.UserId);
            await AddUserToProjectAsync(conn, projectDoc, userDoc, SFProjectRole.Administrator);

            // Add the source after the project has been created
            // This will make the source project appear after the target, if it needs to be created
            if (settings.SourceParatextId != null && settings.SourceParatextId != settings.ParatextId)
            {
                TranslateSource source = await GetTranslateSourceAsync(
                    userAccessor,
                    projectDoc.Id,
                    settings.SourceParatextId,
                    syncIfCreated: false,
                    ptProjects
                );

                await projectDoc.SubmitJson0OpAsync(op => UpdateSetting(op, p => p.TranslateConfig.Source, source));
            }
        }

        await _syncService.SyncAsync(
            new SyncConfig
            {
                ProjectId = projectId,
                TrainEngine = false,
                UserAccessor = userAccessor,
            }
        );
        return projectId;
    }

    /// <summary>
    /// Asynchronously creates a project for a Paratext resource.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="paratextId">The paratext resource identifier.</param>
    /// <param name="addUser">
    /// If <c>true</c>, add the user to the project.
    /// If the project already exists, no error is returned but the user is added to the project.
    /// </param>
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
    public async Task<string> CreateResourceProjectAsync(string curUserId, string paratextId, bool addUser)
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
            IReadOnlyList<ParatextResource> resources = await _paratextService.GetResourcesAsync(curUserId);
            ptProject = resources.SingleOrDefault(r => r.ParatextId == paratextId);
            if (ptProject == null)
            {
                throw new DataNotFoundException("The paratext project or resource does not exist.");
            }
        }

        if (addUser)
        {
            // See if the project exists to add the user to it
            SFProject? project = await RealtimeService
                .QuerySnapshots<SFProject>()
                .FirstOrDefaultAsync(sfProject => sfProject.ParatextId == ptProject.ParatextId);
            if (project is not null)
            {
                // Add the user, if they are not already on the project
                if (!project.UserRoles.ContainsKey(curUserId))
                {
                    await AddUserAsync(curUserId, project.Id, projectRole: null);
                }

                return project.Id;
            }
        }

        // Create the project, as it does not already exist, and add the user if we should
        string projectId = await CreateResourceProjectInternalAsync(curUserId, ptProject);
        if (addUser)
        {
            await AddUserAsync(curUserId, projectId, projectRole: null);
        }

        return projectId;
    }

    public async Task DeleteProjectAsync(string curUserId, string projectId)
    {
        await using (IConnection conn = await RealtimeService.ConnectAsync(curUserId))
        {
            IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
            if (!projectDoc.IsLoaded)
                throw new DataNotFoundException("The project does not exist.");
            if (!IsProjectAdmin(projectDoc.Data, curUserId))
                throw new ForbiddenException();

            // Do not delete if any syncs are occurring
            if (projectDoc.Data.Sync.QueuedCount > 0)
                throw new InvalidOperationException("A project cannot be deleted while it is syncing.");

            // Get the user information who is deleting the project
            IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
            if (!userDoc.IsLoaded)
                throw new ForbiddenException();

            // Log this event to the event metrics
            // We do this here to record additional information about the user and project
            string ptProjectId = projectDoc.Data.ParatextId;
            var arguments = new Dictionary<string, object>
            {
                { nameof(projectId), projectId },
                { nameof(curUserId), curUserId },
                { "paratextId", ptProjectId },
                { "user", new { name = userDoc.Data.Name, email = userDoc.Data.Email } },
            };
            await _eventMetricService.SaveEventMetricAsync(
                projectId,
                curUserId,
                nameof(DeleteProjectAsync),
                EventScope.Settings,
                arguments,
                result: null,
                exception: null
            );

            // Log this to the system log
            _logger.LogInformation(
                "The project {projectId} ({shortName} - {name}) with Paratext id {ptProjectId} is being deleted by "
                    + "user {curUserId}",
                projectId,
                projectDoc.Data.ShortName,
                projectDoc.Data.Name,
                ptProjectId,
                curUserId
            );
            string projectDir = Path.Combine(SiteOptions.Value.SiteDir, "sync", ptProjectId);
            if (FileSystemService.DirectoryExists(projectDir))
                FileSystemService.DeleteDirectory(projectDir);
            string audioDir = GetAudioDir(projectId);
            if (FileSystemService.DirectoryExists(audioDir))
                FileSystemService.DeleteDirectory(audioDir);
            string trainingDataDir = Path.Combine(
                SiteOptions.Value.SiteDir,
                TrainingDataService.DirectoryName,
                ptProjectId
            );
            if (FileSystemService.DirectoryExists(trainingDataDir))
                FileSystemService.DeleteDirectory(trainingDataDir);

            string[] projectUserIds = [.. projectDoc.Data.UserRoles.Keys];
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

        await RealtimeService.DeleteProjectAsync(projectId);

        // The machine service requires the project secrets, so call it before removing them
        await _machineProjectService.RemoveProjectAsync(projectId, preTranslate: false, CancellationToken.None);
        await _machineProjectService.RemoveProjectAsync(projectId, preTranslate: true, CancellationToken.None);
        await ProjectSecrets.DeleteAsync(projectId);
    }

    public async Task UpdateSettingsAsync(IUserAccessor userAccessor, string projectId, SFProjectSettings settings)
    {
        // Throw an exception if obsolete settings are specified
#pragma warning disable CS0618 // Type or member is obsolete
        if (settings.CheckingShareEnabled is not null)
            throw new ForbiddenException();
        if (settings.TranslateShareEnabled is not null)
            throw new ForbiddenException();
#pragma warning restore CS0618 // Type or member is obsolete

        // Connect to the realtime server
        await using IConnection conn = await RealtimeService.ConnectAsync(userAccessor.UserId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
        if (!projectDoc.IsLoaded)
            throw new DataNotFoundException("The project does not exist.");
        if (!IsProjectAdmin(projectDoc.Data, userAccessor.UserId))
            throw new ForbiddenException();

        bool unsetSourceProject = settings.SourceParatextId == ProjectSettingValueUnset;
        bool unsetAlternateSourceProject = settings.AlternateSourceParatextId == ProjectSettingValueUnset;
        bool unsetAlternateTrainingSourceProject =
            settings.AlternateTrainingSourceParatextId == ProjectSettingValueUnset;
        bool unsetAdditionalTrainingSourceProject =
            settings.AdditionalTrainingSourceParatextId == ProjectSettingValueUnset;

        // Get the list of projects for setting the source or alternate source
        IReadOnlyList<ParatextProject> ptProjects = new List<ParatextProject>();
        if (
            (settings.SourceParatextId != null && !unsetSourceProject)
            || (settings.AlternateSourceParatextId != null && !unsetAlternateSourceProject)
            || (settings.AlternateTrainingSourceParatextId != null && !unsetAlternateTrainingSourceProject)
            || (settings.AdditionalTrainingSourceParatextId != null && !unsetAdditionalTrainingSourceProject)
        )
        {
            Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(userAccessor.UserId);
            if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                throw new DataNotFoundException("The user does not exist.");

            ptProjects = await _paratextService.GetProjectsAsync(userSecret);
        }

        // Get the source - any creation or permission updates are handled in GetTranslateSourceAsync
        TranslateSource source = null;
        if (settings.SourceParatextId != null && !unsetSourceProject)
        {
            source = await GetTranslateSourceAsync(
                userAccessor,
                projectId,
                settings.SourceParatextId,
                syncIfCreated: false,
                ptProjects,
                projectDoc.Data.UserRoles
            );
            if (source.ProjectRef == projectId)
            {
                // A project cannot reference itself
                source = null;
            }
        }

        // Get the alternate source for pre-translation drafting
        TranslateSource alternateSource = null;
        if (settings.AlternateSourceParatextId != null && !unsetAlternateSourceProject)
        {
            alternateSource = await GetTranslateSourceAsync(
                userAccessor,
                projectId,
                settings.AlternateSourceParatextId,
                syncIfCreated: true,
                ptProjects,
                projectDoc.Data.UserRoles
            );
            if (alternateSource.ProjectRef == projectId)
            {
                // A project cannot reference itself
                alternateSource = null;
            }
        }

        // Get the alternate training source for pre-translation drafting
        TranslateSource alternateTrainingSource = null;
        if (settings.AlternateTrainingSourceParatextId != null && !unsetAlternateTrainingSourceProject)
        {
            alternateTrainingSource = await GetTranslateSourceAsync(
                userAccessor,
                projectId,
                settings.AlternateTrainingSourceParatextId,
                syncIfCreated: true,
                ptProjects,
                projectDoc.Data.UserRoles
            );
            if (alternateTrainingSource.ProjectRef == projectId)
            {
                // A project cannot reference itself
                alternateTrainingSource = null;
            }
        }

        // Get the additional training source for pre-translation drafting
        TranslateSource additionalTrainingSource = null;
        if (settings.AdditionalTrainingSourceParatextId != null && !unsetAdditionalTrainingSourceProject)
        {
            additionalTrainingSource = await GetTranslateSourceAsync(
                userAccessor,
                projectId,
                settings.AdditionalTrainingSourceParatextId,
                syncIfCreated: true,
                ptProjects,
                projectDoc.Data.UserRoles
            );
            if (additionalTrainingSource.ProjectRef == projectId)
            {
                // A project cannot reference itself
                additionalTrainingSource = null;
            }
        }

        bool hasExistingMachineProject = projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled;
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            UpdateSetting(
                op,
                p => p.TranslateConfig.TranslationSuggestionsEnabled,
                settings.TranslationSuggestionsEnabled
            );
            UpdateSetting(op, p => p.BiblicalTermsConfig.BiblicalTermsEnabled, settings.BiblicalTermsEnabled);
            UpdateSetting(op, p => p.TranslateConfig.Source, source, unsetSourceProject);
            UpdateSetting(
                op,
                p => p.TranslateConfig.DraftConfig.AlternateSourceEnabled,
                settings.AlternateSourceEnabled
            );
            UpdateSetting(
                op,
                p => p.TranslateConfig.DraftConfig.AlternateSource,
                alternateSource,
                unsetAlternateSourceProject
            );
            UpdateSetting(
                op,
                p => p.TranslateConfig.DraftConfig.AlternateTrainingSourceEnabled,
                settings.AlternateTrainingSourceEnabled
            );
            UpdateSetting(
                op,
                p => p.TranslateConfig.DraftConfig.AlternateTrainingSource,
                alternateTrainingSource,
                unsetAlternateTrainingSourceProject
            );
            UpdateSetting(
                op,
                p => p.TranslateConfig.DraftConfig.AdditionalTrainingSourceEnabled,
                settings.AdditionalTrainingSourceEnabled
            );
            UpdateSetting(
                op,
                p => p.TranslateConfig.DraftConfig.AdditionalTrainingSource,
                additionalTrainingSource,
                unsetAdditionalTrainingSourceProject
            );
            UpdateSetting(
                op,
                p => p.TranslateConfig.DraftConfig.AdditionalTrainingData,
                settings.AdditionalTrainingData
            );

            UpdateSetting(op, p => p.CheckingConfig.CheckingEnabled, settings.CheckingEnabled);
            UpdateSetting(op, p => p.CheckingConfig.UsersSeeEachOthersResponses, settings.UsersSeeEachOthersResponses);
            UpdateSetting(op, p => p.CheckingConfig.AnswerExportMethod, settings.CheckingAnswerExport);
            UpdateSetting(op, p => p.CheckingConfig.HideCommunityCheckingText, settings.HideCommunityCheckingText);
        });

        bool suggestionsEnabledSet = settings.TranslationSuggestionsEnabled != null;
        bool sourceParatextIdSet = settings.SourceParatextId != null || unsetSourceProject;
        bool checkingEnabledSet = settings.CheckingEnabled != null;
        bool biblicalTermsEnabledSet = settings.BiblicalTermsEnabled != null;
        // check if a sync needs to be run
        if (suggestionsEnabledSet || sourceParatextIdSet || checkingEnabledSet || biblicalTermsEnabledSet)
        {
            bool trainEngine = false;
            if (suggestionsEnabledSet || sourceParatextIdSet)
            {
                if (
                    projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled
                    && projectDoc.Data.TranslateConfig.Source != null
                )
                {
                    // translation suggestions was enabled or source project changed

                    // recreate Machine project only if one existed
                    if (hasExistingMachineProject)
                    {
                        await _machineProjectService.RemoveProjectAsync(
                            projectId,
                            preTranslate: false,
                            CancellationToken.None
                        );
                    }

                    await EnsureWritingSystemTagIsSetAsync(userAccessor.UserId, projectDoc, ptProjects);
                    await _machineProjectService.AddProjectAsync(
                        projectId,
                        preTranslate: false,
                        CancellationToken.None
                    );
                    trainEngine = true;
                }
                else if (hasExistingMachineProject)
                {
                    // translation suggestions was disabled or source project set to null
                    await _machineProjectService.RemoveProjectAsync(
                        projectId,
                        preTranslate: false,
                        CancellationToken.None
                    );
                }
            }

            await _syncService.SyncAsync(
                new SyncConfig
                {
                    ProjectId = projectId,
                    TrainEngine = trainEngine,
                    UserAccessor = userAccessor,
                }
            );
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

    /// <summary>
    /// Starts the sync for the specified project.
    /// </summary>
    /// <param name="userAccessor">The user accessor.</param>
    /// <param name="projectId">The paratext project identifier.</param>
    /// <returns>The job identifier.</returns>
    /// <exception cref="DataNotFoundException">The project or user does not exist.</exception>
    /// <exception cref="ForbiddenException">The user is not an administrator or translator.</exception>
    /// <exception cref="UnauthorizedAccessException">The user cannot access the Paratext Registry or Archives.</exception>
    public async Task<string> SyncAsync(IUserAccessor userAccessor, string projectId)
    {
        // Ensure the project exists
        Attempt<SFProject> attempt = await RealtimeService.TryGetSnapshotAsync<SFProject>(projectId);
        if (!attempt.TryResult(out SFProject project))
            throw new DataNotFoundException("The project does not exist.");

        // Ensure that the user has a Paratext role
        if (!HasParatextRole(project, userAccessor.UserId))
            throw new ForbiddenException();

        // Project syncs require admin or translator role, or consultant if a Serval Admin.
        // Resources can sync with any paratext role.
        if (
            !_paratextService.IsResource(project.ParatextId)
            && !(
                IsProjectAdmin(project, userAccessor.UserId)
                || IsProjectTranslator(project, userAccessor.UserId)
                || (
                    userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin)
                    && IsProjectConsultant(project, userAccessor.UserId)
                )
            )
        )
        {
            throw new ForbiddenException();
        }

        // Retrieve the user's secrets
        Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(userAccessor.UserId);
        if (!userSecretAttempt.TryResult(out UserSecret userSecret))
            throw new DataNotFoundException("The user does not exist.");

        // Ensure that the user can access the Paratext registry
        // NOTE: These next two methods will throw UnauthorizedAccessException on failure to refresh the token
        if (!await _paratextService.CanUserAuthenticateToPTRegistryAsync(userSecret))
            throw new UnauthorizedAccessException();

        // Ensure that the user can access the Paratext archives
        if (!await _paratextService.CanUserAuthenticateToPTArchivesAsync(userAccessor.UserId))
            throw new UnauthorizedAccessException();

        // Queue the sync
        return await _syncService.SyncAsync(new SyncConfig { ProjectId = projectId, UserAccessor = userAccessor });
    }

    public async Task CancelSyncAsync(IUserAccessor userAccessor, string projectId)
    {
        SFProject project = await GetProjectAsync(projectId);
        if (!HasParatextRole(project, userAccessor.UserId))
            throw new ForbiddenException();

        // Project syncs require admin or translator role, or consultant if a Serval Admin.
        // Resources can sync with any paratext role.
        if (!_paratextService.IsResource(project.ParatextId))
        {
            if (
                !(
                    IsProjectAdmin(project, userAccessor.UserId)
                    || IsProjectTranslator(project, userAccessor.UserId)
                    || (
                        userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin)
                        && IsProjectConsultant(project, userAccessor.UserId)
                    )
                )
            )
                throw new ForbiddenException();
        }

        await _syncService.CancelSyncAsync(userAccessor.UserId, projectId);
    }

    public async Task<bool> InviteAsync(
        string curUserId,
        string projectId,
        string email,
        string locale,
        string role,
        Uri websiteUrl
    )
    {
        SFProject project = await GetProjectAsync(projectId);
        if (!CanUserShareRole(curUserId, project, role, out string userRole))
            throw new ForbiddenException();

        if (
            await RealtimeService
                .QuerySnapshots<User>()
                .AnyAsync(u => project.UserRoles.Keys.Contains(u.Id) && u.Email == email)
        )
        {
            return false;
        }
        SiteOptions siteOptions = SiteOptions.Value;

        string[] availableRoles = GetAvailableRoles(project, userRole);
        if (!availableRoles.Contains(role))
            throw new ForbiddenException();

        CultureInfo.CurrentUICulture = new CultureInfo(locale);
        // Remove the user sharekey if expired
        await ProjectSecrets.UpdateAsync(
            p => p.Id == projectId,
            update => update.RemoveAll(p => p.ShareKeys, sk => sk.Email == email && sk.ExpirationTime < DateTime.UtcNow)
        );
        DateTime expTime = DateTime.UtcNow.AddDays(14);

        // Invite a specific person. Reuse prior code, if any.
        SFProjectSecret projectSecret = await ProjectSecrets.UpdateAsync(
            p => p.Id == projectId && !p.ShareKeys.Any(sk => sk.Email == email),
            update =>
                update.Add(
                    p => p.ShareKeys,
                    new ShareKey
                    {
                        Email = email,
                        Key = _securityService.GenerateKey(),
                        ExpirationTime = expTime,
                        ProjectRole = role,
                        ShareLinkType = ShareLinkType.Recipient,
                        CreatedByRole = userRole,
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
                update =>
                    update
                        .Set(p => p.ShareKeys[index].ExpirationTime, expTime)
                        .Set(p => p.ShareKeys[index].ProjectRole, role)
            );
        }
        string key = projectSecret.ShareKeys.Single(sk => sk.Email == email).Key;
        Uri url = new Uri(websiteUrl, $"projects/{projectId}?sharing=true&shareKey={key}&locale={locale}");
        string linkExpires = _localizer[SharedResource.Keys.InviteLinkExpires];

        User inviter = await RealtimeService.GetSnapshotAsync<User>(curUserId);
        string subject = _localizer[SharedResource.Keys.InviteSubject, project.Name, siteOptions.Name];
        var greeting =
            $"<p>{_localizer[SharedResource.Keys.InviteGreeting, "<p>", inviter.Name, project.Name, siteOptions.Name, $"<a href=\"{url}\">{url}</a><p>"]}";
        var instructions = $"<p>{_localizer[SharedResource.Keys.InviteInstructions, siteOptions.Name, "<b>", "</b>"]}";
        var pt = $"<ul><li>{_localizer[SharedResource.Keys.InvitePTOption, "<b>", "</b>", siteOptions.Name]}</li>";
        var google = $"<li>{_localizer[SharedResource.Keys.InviteGoogleOption, "<b>", "</b>", siteOptions.Name]}</li>";
        var facebook =
            $"<li>{_localizer[SharedResource.Keys.InviteFacebookOption, "<b>", "</b>", siteOptions.Name]}</li>";
        var withemail =
            $"<li>{_localizer[SharedResource.Keys.InviteEmailOption, siteOptions.Name]}</li></ul></p><p></p>";
        var signoff = $"<p>{_localizer[SharedResource.Keys.InviteSignature, "<p>", siteOptions.Name]}</p>";
        var emailBody = $"{greeting}{linkExpires}{instructions}{pt}{google}{facebook}{withemail}{signoff}";
        await _emailService.SendEmailAsync(email, subject, emailBody);
        return true;
    }

    /// <summary> Get the link sharing key for a project if it exists, otherwise create a new one. </summary>
    public async Task<string> GetLinkSharingKeyAsync(
        string curUserId,
        string projectId,
        string role,
        string shareLinkType,
        int daysBeforeExpiration
    )
    {
        SFProject project = await GetProjectAsync(projectId);
        if (!CanUserShareRole(curUserId, project, role, out string userRole))
            throw new ForbiddenException();

        string[] availableRoles = GetAvailableRoles(project, userRole);
        if (!availableRoles.Contains(role))
            throw new ForbiddenException();

        // Generate a new link sharing key for the given role
        string key = _securityService.GenerateKey();

        await ProjectSecrets.UpdateAsync(
            p => p.Id == projectId,
            update =>
                update.Add(
                    p => p.ShareKeys,
                    new ShareKey
                    {
                        Key = key,
                        ProjectRole = role,
                        ShareLinkType = shareLinkType,
                        ExpirationTime = DateTime.UtcNow.AddDays(daysBeforeExpiration),
                        CreatedByRole = userRole,
                    }
                )
        );
        return key;
    }

    public async Task ReserveLinkSharingKeyAsync(string curUserId, string shareKey, int daysBeforeExpiration)
    {
        ProjectSecret projectSecret =
            ProjectSecrets.Query().FirstOrDefault(ps => ps.ShareKeys.Any(sk => sk.Key == shareKey))
            ?? throw new DataNotFoundException("Unable to locate shareKey");
        string projectId = projectSecret.Id;
        SFProject project = await GetProjectAsync(projectId);
        if (!IsProjectAdmin(project, curUserId))
            throw new ForbiddenException();

        int index = projectSecret.ShareKeys.FindIndex(sk => sk.Key == shareKey);
        await ProjectSecrets.UpdateAsync(
            p => p.Id == project.Id,
            update =>
                update
                    .Set(p => p.ShareKeys[index].Reserved, true)
                    .Set(p => p.ShareKeys[index].ExpirationTime, DateTime.UtcNow.AddDays(daysBeforeExpiration))
        );
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

        await ProjectSecrets.UpdateAsync(
            projectId,
            u => u.RemoveAll(secretSet => secretSet.ShareKeys, shareKey => shareKey.Email == (emailToUninvite))
        );
    }

    /// <summary>Increase the amount of times an auth0 user has been generated using the share key</summary>
    public async Task IncreaseShareKeyUsersGenerated(string shareKey)
    {
        ValidShareKey validShareKey = await CheckShareKeyValidity(shareKey);
        int index = validShareKey.ProjectSecret.ShareKeys.FindIndex(sk => sk.Key == shareKey);
        if (index > -1)
        {
            var usersGenerated = (validShareKey.ShareKey.UsersGenerated ?? 0) + 1;
            await ProjectSecrets.UpdateAsync(
                p => p.Id == validShareKey.Project.Id,
                update => update.Set(p => p.ShareKeys[index].UsersGenerated, usersGenerated)
            );
        }
    }

    /// <summary>Is there already a pending invitation to the project for the specified email address?</summary>
    public async Task<bool> IsAlreadyInvitedAsync(string curUserId, string projectId, string? email)
    {
        SFProject project = await GetProjectAsync(projectId);
        if (!project.UserRoles.TryGetValue(curUserId, out string userRole))
        {
            throw new ForbiddenException();
        }

        string[] availableRoles = GetAvailableRoles(project, userRole);
        bool sharingEnabled =
            availableRoles.Contains(SFProjectRole.CommunityChecker)
            || availableRoles.Contains(SFProjectRole.Commenter)
            || availableRoles.Contains(SFProjectRole.Viewer);
        if (!IsProjectAdmin(project, curUserId) && !(IsOnProject(project, curUserId) && sharingEnabled))
            throw new ForbiddenException();

        if (email == null)
            return false;
        return await ProjectSecrets
            .Query()
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
        return projectSecret
            .ShareKeys.Where(s => s.Email != null)
            .Select(sk => new InviteeStatus
            {
                Email = sk.Email,
                Role = sk.ProjectRole,
                Expired = sk.ExpirationTime < now,
            })
            .ToArray();
    }

    /// <summary> Check that a share link is valid for a project and add the user to the project. </summary>
    /// <returns>Returns the projectId, which is used by the Angular join component to navigate to the project</returns>
    public async Task<string> JoinWithShareKeyAsync(string curUserId, string shareKey)
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        ProjectSecret projectSecret =
            ProjectSecrets.Query().FirstOrDefault(ps => ps.ShareKeys.Any(sk => sk.Key == shareKey))
            ?? throw new DataNotFoundException("project_link_is_invalid");
        string projectId = projectSecret.Id;
        ShareKey projectSecretShareKey = projectSecret.ShareKeys.FirstOrDefault(sk => sk.Key == shareKey);

        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);
        SFProject project = projectDoc.Data;
        if (project.UserRoles.ContainsKey(curUserId))
            return projectId;

        if (projectSecretShareKey?.RecipientUserId != null)
        {
            if (projectSecretShareKey.RecipientUserId == curUserId)
            {
                return projectId;
            }
            throw new DataNotFoundException("key_already_used");
        }

        IDocument<User> userDoc = await conn.FetchAsync<User>(curUserId);
        // Attempt to get the role for the user from the Paratext registry
        Attempt<string> attempt = await TryGetProjectRoleAsync(project, curUserId);
        if (attempt.TryResult(out string projectRole))
        {
            await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole, projectSecretShareKey?.Key);
            return projectId;
        }

        // Ensure the share key is valid for everyone else
        await CheckShareKeyValidity(shareKey);

        if (projectSecretShareKey?.ShareLinkType == ShareLinkType.Anyone)
        {
            await AddUserToProjectAsync(
                conn,
                projectDoc,
                userDoc,
                projectSecretShareKey.ProjectRole,
                projectSecretShareKey.Key
            );
            return projectId;
        }
        // Look for a valid specific user share key.
        if (projectSecretShareKey?.ShareLinkType == ShareLinkType.Recipient)
        {
            await AddUserToProjectAsync(
                conn,
                projectDoc,
                userDoc,
                projectSecretShareKey.ProjectRole,
                projectSecretShareKey.Key
            );
            return projectId;
        }
        throw new DataNotFoundException("project_link_is_invalid");
    }

    /// <summary> Check that a share link is valid and return the corresponding secret key. </summary>
    public async Task<ValidShareKey> CheckShareKeyValidity(string shareKey)
    {
        SFProjectSecret projectSecret = GetProjectSecretByShareKey(shareKey);
        ShareKey projectSecretShareKey = projectSecret.ShareKeys.FirstOrDefault(sk => sk.Key == shareKey);
        SFProject project = await GetProjectAsync(projectSecret.Id);

        // If the key isn't complete
        if (string.IsNullOrWhiteSpace(projectSecretShareKey?.ProjectRole))
        {
            throw new DataNotFoundException("role_not_found");
        }

        // If the key is expired
        if (projectSecretShareKey.ExpirationTime < DateTime.UtcNow)
        {
            throw new DataNotFoundException("key_expired");
        }

        // If the desired role is community checker but community checking is disabled
        if (
            projectSecretShareKey.ProjectRole == SFProjectRole.CommunityChecker
            && !project.CheckingConfig.CheckingEnabled
        )
        {
            throw new DataNotFoundException("role_not_found");
        }

        // If the link was sent by a non-admin and an admin has since disabled non-admin sharing
        if (projectSecretShareKey.CreatedByRole != SFProjectRole.Administrator)
        {
            string[] availableRoles = GetAvailableRoles(project, projectSecretShareKey.CreatedByRole);
            if (!availableRoles.Contains(projectSecretShareKey.ProjectRole))
            {
                throw new DataNotFoundException("role_not_found");
            }
        }

        return new ValidShareKey
        {
            Project = project,
            ProjectSecret = projectSecret,
            ShareKey = projectSecretShareKey,
        };
    }

    public async Task<QueryResults<EventMetric>> GetEventMetricsAsync(
        string curUserId,
        string[] systemRoles,
        string projectId,
        int pageIndex,
        int pageSize
    )
    {
        // Ensure that the page index is valid
        if (pageIndex < 0)
        {
            throw new FormatException($"{nameof(pageIndex)} is not a valid page index.");
        }

        // Ensure that the page size is valid
        if (pageSize <= 0)
        {
            throw new FormatException($"{nameof(pageSize)} is not a valid page size.");
        }

        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);

        // Ensure that the project exists
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // The user must be an admin on the project, or have system admin or serval admin permissions
        if (
            !(
                IsProjectAdmin(projectDoc.Data, curUserId)
                || systemRoles.Contains(SystemRole.SystemAdmin)
                || systemRoles.Contains(SystemRole.ServalAdmin)
            )
        )
        {
            throw new ForbiddenException();
        }

        // Return the event metrics
        return await _eventMetricService.GetEventMetricsAsync(projectId, pageIndex, pageSize);
    }

    public SFProjectSecret GetProjectSecretByShareKey(string shareKey)
    {
        SFProjectSecret projectSecret =
            ProjectSecrets.Query().FirstOrDefault(ps => ps.ShareKeys.Any(sk => sk.Key == shareKey))
            ?? throw new DataNotFoundException("project_link_is_invalid");
        return projectSecret;
    }

    /// <summary> Determine if the specified project is an active source project. </summary>
    public bool IsSourceProject(string projectId)
    {
        IQueryable<SFProject> projectQuery = RealtimeService.QuerySnapshots<SFProject>();
        return projectQuery.Any(p =>
            (p.TranslateConfig.Source != null && (p.TranslateConfig.Source.ProjectRef == projectId))
            || (
                p.TranslateConfig.DraftConfig.AlternateSource != null
                && (p.TranslateConfig.DraftConfig.AlternateSource.ProjectRef == projectId)
            )
            || (
                p.TranslateConfig.DraftConfig.AlternateTrainingSource != null
                && (p.TranslateConfig.DraftConfig.AlternateTrainingSource.ProjectRef == projectId)
            )
            || (
                p.TranslateConfig.DraftConfig.AdditionalTrainingSource != null
                && (p.TranslateConfig.DraftConfig.AdditionalTrainingSource.ProjectRef == projectId)
            )
        );
    }

    public async Task<IEnumerable<TransceleratorQuestion>> TransceleratorQuestionsAsync(
        string curUserId,
        string projectId
    )
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);
        if (!_projectRights.HasRight(projectDoc.Data, curUserId, SFProjectDomain.Questions, Operation.Create))
        {
            throw new ForbiddenException();
        }

        return _transceleratorService.Questions(projectDoc.Data.ParatextId);
    }

    /// <summary>
    /// Ensures that the <see cref="WritingSystem"/> Tag is not null.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="projectId">The project identifier.</param>
    /// <returns>The asynchronous task.</returns>
    /// <remarks>
    /// This public method exists for the Serval Migration utility.
    /// </remarks>
    public async Task EnsureWritingSystemTagIsSetAsync(string curUserId, string projectId)
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);
        await EnsureWritingSystemTagIsSetAsync(curUserId, projectDoc, null);
    }

    /// <summary>
    /// Creates or updates audio timing data.
    /// </summary>
    /// <param name="userId">The user identifier</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="book">The book number.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <param name="timingData">A collection of timing data for the audio file.</param>
    /// <param name="audioUrl">The uploaded audio file URL.</param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    /// <exception cref="ForbiddenException">The user is not an administrator.</exception>
    public async Task CreateAudioTimingData(
        string userId,
        string projectId,
        int book,
        int chapter,
        List<AudioTiming> timingData,
        string audioUrl
    )
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(userId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);
        if (!_projectRights.HasRight(projectDoc.Data, userId, SFProjectDomain.TextAudio, Operation.Create))
        {
            throw new ForbiddenException();
        }

        string textAudioId = TextAudio.GetDocId(projectDoc.Id, book, chapter);
        IDocument<TextAudio> textAudioDoc = await conn.FetchOrCreateAsync(
            textAudioId,
            () =>
                new TextAudio
                {
                    OwnerRef = userId,
                    ProjectRef = projectId,
                    // TODO (scripture audio) Should the ID be set here? How does the DataId differ from the document ID?
                    DataId = textAudioId,
                }
        );

        await textAudioDoc.SubmitJson0OpAsync(op =>
        {
            // TODO (scripture audio) get mimetype from client and make sure it is an acceptable value
            op.Set(ta => ta.MimeType, "audio/mp3");
            op.Set(ta => ta.AudioUrl, audioUrl);
            op.Set(ta => ta.Timings, timingData);
        });

        int textIndex = projectDoc.Data.Texts.FindIndex(t => t.BookNum == book);
        int chapterIndex = projectDoc.Data.Texts[textIndex].Chapters.FindIndex(c => c.Number == chapter);
        await projectDoc.SubmitJson0OpAsync(op =>
            op.Set(pd => pd.Texts[textIndex].Chapters[chapterIndex].HasAudio, true)
        );
    }

    /// <summary>
    /// Deletes the audio timing data.
    /// </summary>
    /// <param name="userId">The user identifier</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="book">The book number.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="DataNotFoundException">
    /// The project does not exist or the audio timing data does not exist.
    /// </exception>
    /// <exception cref="ForbiddenException">The user is not an administrator.</exception>
    public async Task DeleteAudioTimingData(string userId, string projectId, int book, int chapter)
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(userId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);
        if (!_projectRights.HasRight(projectDoc.Data, userId, SFProjectDomain.TextAudio, Operation.Delete))
        {
            throw new ForbiddenException();
        }

        string textAudioId = TextAudio.GetDocId(projectDoc.Id, book, chapter);
        IDocument<TextAudio> textAudioDoc = await conn.FetchAsync<TextAudio>(textAudioId);
        if (!textAudioDoc.IsLoaded)
        {
            // TODO (scripture audio) Do we really want to throw when the data we are trying to delete is not found?
            // We can still try to set HasAudio to false on the project
            throw new DataNotFoundException("The audio timing data does not exist.");
        }
        await textAudioDoc.DeleteAsync();

        int textIndex = projectDoc.Data.Texts.FindIndex(t => t.BookNum == book);
        int chapterIndex = projectDoc.Data.Texts[textIndex].Chapters.FindIndex(c => c.Number == chapter);
        await projectDoc.SubmitJson0OpAsync(op =>
            op.Set(pd => pd.Texts[textIndex].Chapters[chapterIndex].HasAudio, false)
        );
    }

    public async Task SetPreTranslateAsync(string curUserId, string[] systemRoles, string projectId, bool preTranslate)
    {
        if (!(systemRoles.Contains(SystemRole.SystemAdmin) || systemRoles.Contains(SystemRole.ServalAdmin)))
            throw new ForbiddenException();

        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);
        await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.TranslateConfig.PreTranslate, preTranslate));
    }

    public async Task SetServalConfigAsync(
        string curUserId,
        string[] systemRoles,
        string projectId,
        string? servalConfig
    )
    {
        if (!systemRoles.Contains(SystemRole.SystemAdmin))
            throw new ForbiddenException();

        // Normalize whitespace and empty values to null
        if (string.IsNullOrWhiteSpace(servalConfig))
            servalConfig = null;

        // Ensure that the config is valid JSON
        if (servalConfig is not null)
            JObject.Parse(servalConfig);

        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);
        await projectDoc.SubmitJson0OpAsync(op =>
            op.Set(p => p.TranslateConfig.DraftConfig.ServalConfig, servalConfig)
        );
    }

    protected override async Task AddUserToProjectAsync(
        IConnection conn,
        IDocument<SFProject> projectDoc,
        IDocument<User> userDoc,
        string projectRole,
        string? shareKey = null
    )
    {
        // Check if a project user config already exists
        var projectUserConfig = await conn.FetchAsync<SFProjectUserConfig>(
            SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id)
        );
        if (!projectUserConfig.IsLoaded)
        {
            await conn.CreateAsync(
                SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id),
                new SFProjectUserConfig { ProjectRef = projectDoc.Id, OwnerRef = userDoc.Id }
            );
        }
        // Listeners can now assume the ProjectUserConfig is ready when the user is added.
        await base.AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole, shareKey);

        // Update book and chapter permissions on SF project/resource, but only if user
        // has a role on the PT project or permissions to the DBL resource. These permissions are needed
        // in order to query the PT roles and DBL permissions of other SF project/resource users.
        if ((await TryGetProjectRoleAsync(projectDoc.Data, userDoc.Id)).Success)
        {
            await UpdatePermissionsAsync(userDoc.Id, projectDoc);
        }

        // Add to the source project, if required
        string sourceProjectId = projectDoc.Data.TranslateConfig.Source?.ProjectRef;
        string sourceParatextId = projectDoc.Data.TranslateConfig.Source?.ParatextId;
        if (!string.IsNullOrWhiteSpace(sourceProjectId) && !string.IsNullOrWhiteSpace(sourceParatextId))
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
                    await AddUserToProjectAsync(conn, sourceProjectDoc, userDoc, sourceProjectRole, shareKey);
                }
            }
        }
    }

    /// <summary>
    /// Checks Paratext if User Role has changed and syncs the role and permissions to the SF project.
    /// </summary>
    public async Task SyncUserRoleAsync(string curUserId, string projectId)
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);

        // Throwing a ForbiddenException so the user is notified to contact the project administrator.
        // We do not want to inadvertently remove the user from the project if there was an issue
        // connecting to the Paratext registry.
        if (!(await TryGetProjectRoleAsync(projectDoc.Data, curUserId)).TryResult(out string ptRole))
            throw new ForbiddenException();

        if (projectDoc.Data.UserRoles[curUserId] != ptRole)
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserRoles[curUserId], ptRole));
        }

        await UpdatePermissionsAsync(curUserId, projectDoc);
    }

    /// <summary>
    /// Update all user permissions on books and chapters in an SF project, from PT project permissions. For Paratext
    /// projects, permissions are acquired from ScrText objects, and so presumably only what was received from
    /// Paratext in the last synchronize. For Resources, permissions are fetched from a DBL server, and so permissions
    /// may be ahead of the last sync.
    /// Note that this method is not necessarily applying permissions for user `curUserId`, but rather using that
    /// user to perform PT queries and set values in the SF DB.
    /// </summary>
    public async Task UpdatePermissionsAsync(
        string curUserId,
        IDocument<SFProject> projectDoc,
        IReadOnlyList<ParatextProjectUser>? users = null,
        CancellationToken token = default
    )
    {
        Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
        if (!userSecretAttempt.TryResult(out UserSecret userSecret))
        {
            throw new DataNotFoundException("No matching user secrets found.");
        }

        string paratextId = projectDoc.Data.ParatextId;
        HashSet<int> booksInProject = [.. _paratextService.GetBookList(userSecret, paratextId)];
        users ??= await _paratextService.GetParatextUsersAsync(userSecret, projectDoc.Data, token);
        IReadOnlyDictionary<string, string> ptUsernameMapping = users
            .Where(u => !string.IsNullOrWhiteSpace(u.Id) && !string.IsNullOrWhiteSpace(u.Username))
            .ToDictionary(u => u.Id, u => u.Username);
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
            resourcePermissions = await _paratextService.GetPermissionsAsync(
                userSecret,
                projectDoc.Data,
                ptUsernameMapping,
                0,
                0,
                token
            );
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
            IEnumerable<(
                int bookIndex,
                int chapterIndex,
                Dictionary<string, string> chapterPermissions
            )> chapterPermissionsInBook = null;

            if (isResource)
            {
                bookPermissions = resourcePermissions;
                // Prepare to write the same resource permission for each chapter in the book/text.
                chapterPermissionsInBook = chapters.Select(
                    (Chapter chapter, int chapterIndex) => (textIndex, chapterIndex, bookPermissions)
                );
            }
            else
            {
                bookPermissions = await _paratextService.GetPermissionsAsync(
                    userSecret,
                    projectDoc.Data,
                    ptUsernameMapping,
                    bookNum,
                    0,
                    token
                );

                // Get the project permissions for the chapters
                chapterPermissionsInBook = await Task.WhenAll(
                    chapters.Select(
                        async (Chapter chapter, int chapterIndex) =>
                        {
                            Dictionary<string, string> chapterPermissions = await _paratextService.GetPermissionsAsync(
                                userSecret,
                                projectDoc.Data,
                                ptUsernameMapping,
                                bookNum,
                                chapter.Number,
                                token
                            );
                            return (textIndex, chapterIndex, chapterPermissions);
                        }
                    )
                );
            }
            projectChapterPermissions.AddRange(chapterPermissionsInBook);
            projectBookPermissions.Add((textIndex, bookPermissions));
        }

        // Update project metadata
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            foreach ((int bookIndex, Dictionary<string, string> bookPermissions) in projectBookPermissions)
            {
                op.Set(pd => pd.Texts[bookIndex].Permissions, bookPermissions, _permissionDictionaryEqualityComparer);
            }
            foreach (
                (
                    int bookIndex,
                    int chapterIndex,
                    Dictionary<string, string> chapterPermissions
                ) in projectChapterPermissions
            )
            {
                op.Set(
                    pd => pd.Texts[bookIndex].Chapters[chapterIndex].Permissions,
                    chapterPermissions,
                    _permissionDictionaryEqualityComparer
                );
            }
        });
    }

    /// <summary>
    /// Sets the draft applied flag for the specified text.
    /// </summary>
    /// <param name="userId">The user identifier</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="book">The book number.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <param name="draftApplied"><c>true</c> if the draft is applied; otherwise, <c>false</c>.</param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="DataNotFoundException">
    /// The project does not exist.
    /// </exception>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to set this flag for the specified text.
    /// </exception>
    public async Task SetDraftAppliedAsync(string userId, string projectId, int book, int chapter, bool draftApplied)
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(userId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure that the user has a paratext role, and the project is not a resource
        if (_paratextService.IsResource(projectDoc.Data.ParatextId) || !HasParatextRole(projectDoc.Data, userId))
        {
            throw new ForbiddenException();
        }

        // Get the index to the book
        int textIndex = projectDoc.Data.Texts.FindIndex(t => t.BookNum == book);
        if (textIndex == -1)
        {
            throw new DataNotFoundException("The book does not exist.");
        }

        // Get the index to the chapter
        int chapterIndex = projectDoc.Data.Texts[textIndex].Chapters.FindIndex(c => c.Number == chapter);
        if (chapterIndex == -1)
        {
            throw new DataNotFoundException("The chapter does not exist.");
        }

        // Ensure the user has permission for this chapter
        if (
            !projectDoc
                .Data.Texts[textIndex]
                .Chapters[chapterIndex]
                .Permissions.TryGetValue(userId, out string permission)
        )
        {
            throw new ForbiddenException();
        }

        // Ensure the user can write to this chapter
        if (permission != TextInfoPermission.Write)
        {
            throw new ForbiddenException();
        }

        // Update the draft applied flag
        await projectDoc.SubmitJson0OpAsync(op =>
            op.Set(pd => pd.Texts[textIndex].Chapters[chapterIndex].DraftApplied, draftApplied)
        );
    }

    /// <summary>
    /// Sets the valid flag for the specified text.
    /// </summary>
    /// <param name="userId">The user identifier</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="book">The book number.</param>
    /// <param name="chapter">The chapter number.</param>
    /// <param name="isValid"><c>true</c> if the chapter is valid; otherwise, <c>false</c>.</param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="DataNotFoundException">
    /// The project does not exist.
    /// </exception>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to set this flag for the specified text.
    /// </exception>
    public async Task SetIsValidAsync(string userId, string projectId, int book, int chapter, bool isValid)
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(userId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure that the user has a paratext role, and the project is not a resource
        if (_paratextService.IsResource(projectDoc.Data.ParatextId) || !HasParatextRole(projectDoc.Data, userId))
        {
            throw new ForbiddenException();
        }

        // Get the index to the book
        int textIndex = projectDoc.Data.Texts.FindIndex(t => t.BookNum == book);
        if (textIndex == -1)
        {
            throw new DataNotFoundException("The book does not exist.");
        }

        // Get the index to the chapter
        int chapterIndex = projectDoc.Data.Texts[textIndex].Chapters.FindIndex(c => c.Number == chapter);
        if (chapterIndex == -1)
        {
            throw new DataNotFoundException("The chapter does not exist.");
        }

        // Ensure the user has permission for this chapter
        if (
            !projectDoc
                .Data.Texts[textIndex]
                .Chapters[chapterIndex]
                .Permissions.TryGetValue(userId, out string permission)
        )
        {
            throw new ForbiddenException();
        }

        // Ensure the user can write to this chapter
        if (permission != TextInfoPermission.Write)
        {
            throw new ForbiddenException();
        }

        // Update the draft applied flag
        await projectDoc.SubmitJson0OpAsync(op =>
            op.Set(pd => pd.Texts[textIndex].Chapters[chapterIndex].IsValid, isValid)
        );
    }

    /// <summary>
    /// Sets the permissions for the specified role in the project.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="role">The role.</param>
    /// <param name="permissions">
    /// The array of permissions. The strings are in the format <c>domain.operation</c>.
    /// </param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to set the permissions for the role.
    /// </exception>
    /// <remarks>
    /// The current user must be an administrator and have permissions they are granting.
    /// </remarks>
    public async Task SetRoleProjectPermissionsAsync(
        string curUserId,
        string projectId,
        string role,
        string[] permissions
    )
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);

        // Only administrators can grant permissions to a role
        if (!IsProjectAdmin(projectDoc.Data, curUserId))
            throw new ForbiddenException();

        // An administrator cannot grant greater permissions than they already have
        if (!_projectRights.HasPermissions(projectDoc.Data, curUserId, permissions))
            throw new ForbiddenException();

        if (permissions.Length == 0)
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.RolePermissions[role]));
        }
        else
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.RolePermissions[role], permissions));
        }
    }

    /// <summary>
    /// Sets the permissions for the specified user in the project.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="userId">The user identifier.</param>
    /// <param name="permissions">
    /// The array of permissions. The strings are in the format <c>domain.operation</c>.
    /// </param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to set the permissions for the role.
    /// </exception>
    /// <remarks>
    /// The current user must be an administrator and have permissions they are granting.
    /// </remarks>
    public async Task SetUserProjectPermissionsAsync(
        string curUserId,
        string projectId,
        string userId,
        string[] permissions
    )
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await GetProjectDocAsync(projectId, conn);

        // Only administrators can grant permissions to a user
        if (!IsProjectAdmin(projectDoc.Data, curUserId))
            throw new ForbiddenException();

        // An administrator cannot grant greater permissions than they already have
        if (!_projectRights.HasPermissions(projectDoc.Data, curUserId, permissions))
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

    protected override async Task RemoveUserFromProjectAsync(
        IConnection conn,
        IDocument<SFProject> projectDoc,
        IDocument<User> userDoc
    )
    {
        await base.RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
        IDocument<SFProjectUserConfig> projectUserConfigDoc = await conn.FetchAsync<SFProjectUserConfig>(
            SFProjectUserConfig.GetDocId(projectDoc.Id, userDoc.Id)
        );
        if (projectUserConfigDoc.IsLoaded)
        {
            await projectUserConfigDoc.DeleteAsync();
        }

        // Delete any share keys used by this user
        await ProjectSecrets.UpdateAsync(
            projectDoc.Id,
            u => u.RemoveAll(secretSet => secretSet.ShareKeys, shareKey => shareKey.RecipientUserId == userDoc.Id)
        );
    }

    /// <summary>
    /// Returns `userId`'s role on project or resource `project`.
    /// The role may be the PT role from PT Registry, or a SF role.
    /// The returned Attempt will be Success if they have a non-None role, or otherwise Failure.
    /// </summary>
    protected override async Task<Attempt<string>> TryGetProjectRoleAsync(SFProject project, string userId)
    {
        Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(userId);
        if (userSecretAttempt.TryResult(out UserSecret userSecret))
        {
            if (_paratextService.IsResource(project.ParatextId))
            {
                // If the project is a resource, get the permission from the DBL
                string permission = await _paratextService.GetResourcePermissionAsync(
                    project.ParatextId,
                    userId,
                    CancellationToken.None
                );
                return permission switch
                {
                    TextInfoPermission.None => Attempt.Failure(ProjectRole.None),
                    TextInfoPermission.Read => Attempt.Success(SFProjectRole.PTObserver),
                    _ => throw new ArgumentException(
                        $"Unknown resource permission: '{permission}'",
                        nameof(permission)
                    ),
                };
            }
            else
            {
                Attempt<string> roleAttempt = await _paratextService.TryGetProjectRoleAsync(
                    userSecret,
                    project.ParatextId,
                    CancellationToken.None
                );
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

    /// <summary>
    /// Determines whether the user is a project translator for the specified project.
    /// </summary>
    /// <param name="project">The project.</param>
    /// <param name="userId">The user identifier.</param>
    /// <returns>
    ///   <c>true</c> if a project translator; otherwise, <c>false</c>.
    /// </returns>
    /// <remarks>
    /// This only checks the local project, and is based on <c>ProjectService.IsProjectAdmin</c>.
    /// </remarks>
    private static bool IsProjectTranslator(SFProject project, string userId) =>
        project.UserRoles.TryGetValue(userId, out string role) && role == SFProjectRole.Translator;

    /// <summary>
    /// Determines whether the user is a consultant for the specified project.
    /// </summary>
    /// <param name="project">The project.</param>
    /// <param name="userId">The user identifier.</param>
    /// <returns>
    ///   <c>true</c> if a consultant for the project; otherwise, <c>false</c>.
    /// </returns>
    private static bool IsProjectConsultant(SFProject project, string userId) =>
        project.UserRoles.TryGetValue(userId, out string role) && role == SFProjectRole.Consultant;

    private static bool HasParatextRole(SFProject project, string userId) =>
        project.UserRoles.TryGetValue(userId, out string role) && SFProjectRole.IsParatextRole(role);

    private static void UpdateSetting<T>(
        Json0OpBuilder<SFProject> builder,
        Expression<Func<SFProject, T>> field,
        T setting,
        bool forceUpdate = false
    )
    {
        if (setting != null || forceUpdate)
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
            IsRightToLeft = ptProject.IsRightToLeft,
            ParatextId = ptProject.ParatextId,
            Name = ptProject.Name,
            ShortName = ptProject.ShortName,
            WritingSystem = new WritingSystem
            {
                Region = ptProject.LanguageRegion,
                Script = ptProject.LanguageScript,
                Tag = ptProject.LanguageTag,
            },
            TranslateConfig = new TranslateConfig { TranslationSuggestionsEnabled = false, Source = null },
            CheckingConfig = new CheckingConfig { CheckingEnabled = false },
        };

        // Create the new project using the realtime service
        string projectId = ObjectId.GenerateNewId().ToString();
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        if (RealtimeService.QuerySnapshots<SFProject>().Any(sfProject => sfProject.ParatextId == project.ParatextId))
        {
            throw new InvalidOperationException(ErrorAlreadyConnectedKey);
        }

        IDocument<SFProject> projectDoc = await conn.CreateAsync(projectId, project);
        await ProjectSecrets.InsertAsync(new SFProjectSecret { Id = projectDoc.Id });

        // Resource projects do not have administrators, so users are added as needed
        return projectId;
    }

    /// <summary>
    /// Gets the translation source asynchronously.
    /// </summary>
    /// <param name="userAccessor">The user accessor.</param>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="paratextId">The paratext identifier.</param>
    /// <param name="syncIfCreated">If <c>true</c> sync the project if it is created.</param>
    /// <param name="ptProjects">The paratext projects.</param>
    /// <param name="userRoles">The ids and roles of the users who will need to access the source.</param>
    /// <returns>The <see cref="TranslateSource"/> object for the specified resource.</returns>
    /// <exception cref="DataNotFoundException">The source paratext project does not exist.</exception>
    private async Task<TranslateSource> GetTranslateSourceAsync(
        IUserAccessor userAccessor,
        string sfProjectId,
        string paratextId,
        bool syncIfCreated,
        IEnumerable<ParatextProject> ptProjects,
        IReadOnlyDictionary<string, string>? userRoles = null
    )
    {
        ParatextProject sourcePTProject = ptProjects.SingleOrDefault(p => p.ParatextId == paratextId);
        string sourceProjectRef;
        if (sourcePTProject == null)
        {
            // If it is not a project, see if there is a matching resource
            IReadOnlyList<ParatextResource> resources = await _paratextService.GetResourcesAsync(userAccessor.UserId);
            sourcePTProject = resources.SingleOrDefault(r => r.ParatextId == paratextId);
            if (sourcePTProject == null)
            {
                throw new DataNotFoundException("The source paratext project does not exist.");
            }
        }

        // Get the users who will access this source resource or project
        IEnumerable<string> userIds = userRoles != null ? userRoles.Keys : [userAccessor.UserId];

        // Get the project reference
        SFProject sourceProject = RealtimeService
            .QuerySnapshots<SFProject>()
            .FirstOrDefault(p => p.ParatextId == paratextId);
        bool projectCreated;
        if (sourceProject != null)
        {
            sourceProjectRef = sourceProject.Id;
            projectCreated = false;
        }
        else
        {
            sourceProjectRef = await CreateResourceProjectAsync(userAccessor.UserId, paratextId, addUser: false);
            projectCreated = true;
        }

        await using IConnection conn = await RealtimeService.ConnectAsync(userAccessor.UserId);
        IDocument<SFProject> projectDoc = projectCreated ? null : await GetProjectDocAsync(sourceProjectRef, conn);
        // Add each user in the target project to the source project so they can access it
        foreach (string userId in userIds)
        {
            try
            {
                // Add the user to the project, if the user does not have a role in it
                if (sourceProject == null || !sourceProject.UserRoles.ContainsKey(userId))
                {
                    await AddUserAsync(userId, sourceProjectRef, null);
                }
                else if (projectDoc != null)
                {
                    Attempt<string> attempt = await TryGetProjectRoleAsync(projectDoc.Data, userId);
                    if (attempt.Success)
                    {
                        await UpdatePermissionsAsync(userId, projectDoc);
                    }
                }
            }
            catch (ForbiddenException)
            {
                // The user does not have Paratext access
            }
        }

        // If the project is created, sync it only if we need to
        // This is usually because this is an alternate source for drafting
        if (projectCreated && syncIfCreated)
        {
            string jobId = await _syncService.SyncAsync(
                new SyncConfig { ProjectId = sourceProjectRef, UserAccessor = userAccessor }
            );

            // After syncing the source project (which will take some time), ensure that the writing system matches
            // what is in the project document
            _backgroundJobClient.ContinueJobWith<MachineProjectService>(
                jobId,
                r => r.UpdateTranslationSourcesAsync(userAccessor.UserId, sfProjectId)
            );
        }

        return new TranslateSource
        {
            IsRightToLeft = sourcePTProject.IsRightToLeft,
            ParatextId = paratextId,
            ProjectRef = sourceProjectRef,
            Name = sourcePTProject.Name,
            ShortName = sourcePTProject.ShortName,
            WritingSystem = new WritingSystem
            {
                Region = sourcePTProject.LanguageRegion,
                Script = sourcePTProject.LanguageScript,
                Tag = sourcePTProject.LanguageTag,
            },
        };
    }

    private string[] GetProjectWithReferenceToSource(string projectId)
    {
        if (string.IsNullOrEmpty(projectId))
            return [];
        IQueryable<SFProject> projectQuery = RealtimeService.QuerySnapshots<SFProject>();
        return
        [
            .. projectQuery
                .Where(p => p.TranslateConfig.Source != null && p.TranslateConfig.Source.ProjectRef == projectId)
                .Select(p => p.Id),
        ];
    }

    /// <summary>
    /// Determines if a user on a project has the right to share a specific role.
    /// </summary>
    /// <param name="userId">The user identifier.</param>
    /// <param name="project">The project.</param>
    /// <param name="role">The role.</param>
    /// <param name="userRole">The role of the user identifier by <paramref name="userId"/>.</param>
    /// <returns><c>true</c> if the user can share the specified role; otherwise, <c>false</c>.</returns>
    private bool CanUserShareRole(string userId, SFProject project, string role, out string userRole)
    {
        // If the user is not on the project, they cannot share any roles
        if (!project.UserRoles.TryGetValue(userId, out userRole))
        {
            userRole = string.Empty;
            return false;
        }

        // The user must have the right to invite users
        if (!_projectRights.HasRight(project, userId, SFProjectDomain.UserInvites, Operation.Create))
        {
            return false;
        }

        // Determine if the user's role can invite the specified role
        return GetAvailableRoles(project, userRole).Contains(role);
    }

    /// <summary>
    /// Gets the roles that are available for sharing.
    /// </summary>
    /// <param name="project"></param>
    /// <param name="userRole">The role of the user that will be creating or did create the share link.</param>
    /// <returns>An array of the available roles the user can create share invitations for.</returns>
    /// <remarks>
    /// If you update this function, you will need to update ShareBaseComponent.userShareableRoles in TypeScript.
    /// </remarks>
    private string[] GetAvailableRoles(SFProject project, string userRole)
    {
        bool checkUserRole = userRole is SFProjectRole.Administrator or SFProjectRole.Translator;
        return
        [
            .. new Dictionary<string, bool>
            {
                {
                    SFProjectRole.CommunityChecker,
                    project.CheckingConfig.CheckingEnabled
                        && _projectRights.RoleHasRight(
                            project,
                            role: checkUserRole ? userRole : SFProjectRole.CommunityChecker,
                            SFProjectDomain.UserInvites,
                            Operation.Create
                        )
                },
                {
                    SFProjectRole.Viewer,
                    _projectRights.RoleHasRight(
                        project,
                        role: checkUserRole ? userRole : SFProjectRole.Viewer,
                        SFProjectDomain.UserInvites,
                        Operation.Create
                    )
                },
                {
                    SFProjectRole.Commenter,
                    _projectRights.RoleHasRight(
                        project,
                        role: checkUserRole ? userRole : SFProjectRole.Commenter,
                        SFProjectDomain.UserInvites,
                        Operation.Create
                    )
                },
            }
                .Where(entry => entry.Value)
                .Select(entry => entry.Key),
        ];
    }

    /// <summary>
    /// Ensures that the <see cref="WritingSystem"/> Tag is not null.
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="projectDoc">The project document to check</param>
    /// <param name="ptProjects">
    /// The available Paratext projects. If null, the projects will be retrieved from the server.
    /// </param>
    /// <returns>The asynchronous task.</returns>
    /// <exception cref="DataNotFoundException">
    /// A user secret could not be returned for the user identifier.
    /// </exception>
    /// <remarks>
    /// A issue was introduced in an early version of ScriptureForge where the writing system tag was not set when
    /// the project was created. This issue has since been fixed. Serval requires the writing system tag to be
    /// specified, and so this method should be called before a project is created in Serval to ensure
    /// that it can be created without error. If the writing system tag is already set, it is not modified.
    /// If this is a back translation, the writing system tag will not be set here, but will be set on the first
    /// project build in <see cref="MachineProjectService"/>, as if this method does not update the writing system
    /// tags, the Serval Translation Engine creation will be delayed until first build.
    /// </remarks>
    private async Task EnsureWritingSystemTagIsSetAsync(
        string curUserId,
        IDocument<SFProject> projectDoc,
        IReadOnlyList<ParatextProject>? ptProjects
    )
    {
        // If we do not have a writing system tag
        if (
            string.IsNullOrWhiteSpace(projectDoc.Data.WritingSystem.Tag)
            || string.IsNullOrWhiteSpace(projectDoc.Data.TranslateConfig.Source?.WritingSystem.Tag)
        )
        {
            // Get the projects, if they are missing
            if (ptProjects == null)
            {
                Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
                if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                    throw new DataNotFoundException("The user does not exist.");

                ptProjects = await _paratextService.GetProjectsAsync(userSecret);
            }

            // Update the writing system tag, if it is in the Paratext project
            if (string.IsNullOrWhiteSpace(projectDoc.Data.WritingSystem.Tag))
            {
                ParatextProject ptProject = ptProjects.FirstOrDefault(p => p.ProjectId == projectDoc.Id);
                if (!string.IsNullOrEmpty(ptProject?.LanguageTag))
                {
                    await projectDoc.SubmitJson0OpAsync(op =>
                    {
                        UpdateSetting(op, p => p.WritingSystem.Region, ptProject.LanguageRegion);
                        UpdateSetting(op, p => p.WritingSystem.Script, ptProject.LanguageScript);
                        UpdateSetting(op, p => p.WritingSystem.Tag, ptProject.LanguageTag);
                    });
                }
            }

            // Update the source writing system tag, if it is in the Paratext project
            if (string.IsNullOrWhiteSpace(projectDoc.Data.TranslateConfig.Source?.WritingSystem.Tag))
            {
                ParatextProject ptProject = ptProjects.FirstOrDefault(p =>
                    p.ParatextId == projectDoc.Data.TranslateConfig.Source.ParatextId
                );
                if (!string.IsNullOrEmpty(ptProject?.LanguageTag))
                {
                    await projectDoc.SubmitJson0OpAsync(op =>
                        UpdateSetting(op, p => p.TranslateConfig.Source.WritingSystem.Tag, ptProject.LanguageTag)
                    );
                }
            }
        }
    }
}
