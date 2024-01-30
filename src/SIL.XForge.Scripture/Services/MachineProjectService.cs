using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Newtonsoft.Json.Linq;
using Serval.Client;
using SIL.Extensions;
using SIL.Machine.Corpora;
using SIL.Machine.WebApi.Services;
using SIL.Scripture;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

// Disable notice "The logging message template should not vary between calls to..."
#pragma warning disable CA2254

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides functionality to add, remove, and build Machine projects in both
/// the In-Process Machine and Serval implementations.
/// </summary>
public class MachineProjectService : IMachineProjectService
{
    // Supported translation engines (Serval 1.1 format)
    // Serval 1.2 accepts the translation engine type in 1.1 (PascalCase) and 1.2 (kebab-case) format
    internal const string Echo = "Echo";
    internal const string Nmt = "Nmt";
    internal const string SmtTransfer = "SmtTransfer";

    private readonly IDataFilesClient _dataFilesClient;
    private readonly IEngineService _engineService;
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IFeatureManager _featureManager;
    private readonly IFileSystemService _fileSystemService;
    private readonly ILogger<MachineProjectService> _logger;
    private readonly IParatextService _paratextService;
    private readonly IRepository<SFProjectSecret> _projectSecrets;
    private readonly IRealtimeService _realtimeService;
    private readonly IOptions<SiteOptions> _siteOptions;
    private readonly ISFTextCorpusFactory _textCorpusFactory;
    private readonly ITrainingDataService _trainingDataService;
    private readonly ITranslationEnginesClient _translationEnginesClient;
    private readonly IRepository<UserSecret> _userSecrets;

    public MachineProjectService(
        IDataFilesClient dataFilesClient,
        IEngineService engineService,
        IExceptionHandler exceptionHandler,
        IFeatureManager featureManager,
        IFileSystemService fileSystemService,
        ILogger<MachineProjectService> logger,
        IParatextService paratextService,
        IRepository<SFProjectSecret> projectSecrets,
        IRealtimeService realtimeService,
        IOptions<SiteOptions> siteOptions,
        ISFTextCorpusFactory textCorpusFactory,
        ITrainingDataService trainingDataService,
        ITranslationEnginesClient translationEnginesClient,
        IRepository<UserSecret> userSecrets
    )
    {
        _dataFilesClient = dataFilesClient;
        _engineService = engineService;
        _exceptionHandler = exceptionHandler;
        _featureManager = featureManager;
        _fileSystemService = fileSystemService;
        _logger = logger;
        _paratextService = paratextService;
        _projectSecrets = projectSecrets;
        _realtimeService = realtimeService;
        _siteOptions = siteOptions;
        _textCorpusFactory = textCorpusFactory;
        _trainingDataService = trainingDataService;
        _translationEnginesClient = translationEnginesClient;
        _userSecrets = userSecrets;
    }

    public async Task<string> AddProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Add the project to the in process Machine instance
        var machineProject = new Machine.WebApi.Models.Project
        {
            Id = sfProjectId,
            SourceLanguageTag = project.TranslateConfig.Source!.WritingSystem.Tag,
            TargetLanguageTag = project.WritingSystem.Tag,
        };

        // Only add to the In Process instance if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess) && !preTranslate)
        {
            await _engineService.AddProjectAsync(machineProject);
        }

        // Ensure that the Serval feature flag is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            _logger.LogInformation("Serval feature flag is not enabled");
            return string.Empty;
        }

        // We may not have the source language tag or target language tag if either is a back translation
        // If that is the case, we will create the translation engine on first sync by running this method again
        // After ensuring that the source and target language tags are present
        if (
            !string.IsNullOrWhiteSpace(machineProject.SourceLanguageTag)
            && !string.IsNullOrWhiteSpace(machineProject.TargetLanguageTag)
        )
        {
            return await CreateServalProjectAsync(project, preTranslate, cancellationToken);
        }

        _logger.LogInformation("The source or target language is missing from the project");
        return string.Empty;
    }

    public async Task<TranslationBuild?> BuildProjectAsync(
        string curUserId,
        BuildConfig buildConfig,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Build the project with the In Process Machine instance
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess) && !preTranslate)
        {
            await _engineService.StartBuildByProjectIdAsync(buildConfig.ProjectId);
        }

        // Ensure that the Serval feature flag is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            _logger.LogInformation("Serval feature flag is not enabled");
            return null;
        }

        // Load the target project secrets, so we can get the translation engine ID
        if (!(await _projectSecrets.TryGetAsync(buildConfig.ProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Load the project from the realtime service
        await using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(buildConfig.ProjectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure we have a translation engine id or a pre-translation engine id, and that it exists
        string translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (
            !await TranslationEngineExistsAsync(
                buildConfig.ProjectId,
                translationEngineId,
                preTranslate,
                cancellationToken
            )
        )
        {
            // We do not have one, likely because the translation is a back translation
            // We can only get the language tags for back translations from the ScrText,
            // which is not present until after the first sync (not from the Registry).

            // If the source or target writing system tag is missing, get them from the ScrText
            // We do not need to do this for the alternate source as this would have been populated correctly
            if (
                string.IsNullOrWhiteSpace(projectDoc.Data.WritingSystem.Tag)
                || string.IsNullOrWhiteSpace(projectDoc.Data.TranslateConfig.Source?.WritingSystem.Tag)
            )
            {
                // Get the user secret
                Attempt<UserSecret> userSecretAttempt = await _userSecrets.TryGetAsync(curUserId);
                if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                    throw new DataNotFoundException("The user does not exist.");

                // Update the target writing system tag
                if (string.IsNullOrWhiteSpace(projectDoc.Data.WritingSystem.Tag))
                {
                    string targetLanguageTag = _paratextService.GetLanguageId(userSecret, projectDoc.Data.ParatextId);
                    if (!string.IsNullOrEmpty(targetLanguageTag))
                    {
                        await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.WritingSystem.Tag, targetLanguageTag));
                    }
                }

                // Update the source writing system tag
                if (string.IsNullOrWhiteSpace(projectDoc.Data.TranslateConfig.Source!.WritingSystem.Tag))
                {
                    string sourceLanguageTag = _paratextService.GetLanguageId(
                        userSecret,
                        projectDoc.Data.TranslateConfig.Source!.ParatextId
                    );
                    if (!string.IsNullOrEmpty(sourceLanguageTag))
                    {
                        await projectDoc.SubmitJson0OpAsync(
                            op => op.Set(p => p.TranslateConfig.Source.WritingSystem.Tag, sourceLanguageTag)
                        );
                    }
                }
            }

            // Clear the existing translation engine id and corpora, based on whether this is pre-translation or not
            string[] corporaIds =
                projectSecret
                    .ServalData?.Corpora
                    .Where(c => preTranslate ? c.Value.PreTranslate : !c.Value.PreTranslate)
                    .Select(c => c.Key)
                    .ToArray() ?? Array.Empty<string>();
            await _projectSecrets.UpdateAsync(
                projectDoc.Id,
                u =>
                {
                    if (preTranslate)
                    {
                        u.Unset(p => p.ServalData.PreTranslationEngineId);
                    }
                    else
                    {
                        u.Unset(p => p.ServalData.TranslationEngineId);
                    }

                    foreach (string corporaId in corporaIds)
                    {
                        u.Unset(p => p.ServalData.Corpora[corporaId]);
                    }
                }
            );

            // If the pre-translate flag is not set, set it now for the front-end UI
            if (preTranslate && !projectDoc.Data.TranslateConfig.PreTranslate)
            {
                await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.TranslateConfig.PreTranslate, true));
            }

            // Create the Serval project, and get the translation engine id
            translationEngineId = await CreateServalProjectAsync(projectDoc.Data, preTranslate, cancellationToken);
        }

        // Get the translation engine from Serval
        try
        {
            TranslationEngine translationEngine = await _translationEnginesClient.GetAsync(
                translationEngineId,
                cancellationToken
            );
            bool recreateTranslationEngine = false;

            // See if the target language has changed
            string projectTargetLanguage = await GetTargetLanguageAsync(projectDoc.Data);
            if (translationEngine.TargetLanguage != projectTargetLanguage)
            {
                string message =
                    $"Target language has changed from {translationEngine.TargetLanguage} to {projectTargetLanguage}.";
                _logger.LogInformation(message);
                recreateTranslationEngine = true;
            }

            // See if the source language has changed
            string projectSourceLanguage = GetSourceLanguage(projectDoc.Data, useAlternateTrainingSource: false);
            if (translationEngine.SourceLanguage != projectSourceLanguage)
            {
                string message =
                    $"Source language has changed from {translationEngine.SourceLanguage} to {projectSourceLanguage}.";
                _logger.LogInformation(message);
                recreateTranslationEngine = true;
            }

            // Delete then recreate the translation engine if they have changed
            if (recreateTranslationEngine)
            {
                // Removal can be a slow process
                await RemoveProjectAsync(curUserId, buildConfig.ProjectId, preTranslate, cancellationToken);

                // We use AddProjectAsync, as the In-Process Machine may be enabled
                await AddProjectAsync(curUserId, buildConfig.ProjectId, preTranslate, cancellationToken);
            }
        }
        catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
        {
            // A 404 means that the translation engine does not exist
            _logger.LogInformation($"Translation Engine {translationEngineId} does not exist.");
            string? corporaId = projectSecret
                .ServalData?.Corpora
                .FirstOrDefault(c => preTranslate ? c.Value.PreTranslate : !c.Value.PreTranslate)
                .Key;
            // Clear the existing translation engine id and corpora
            await _projectSecrets.UpdateAsync(
                projectDoc.Id,
                u =>
                {
                    if (preTranslate)
                    {
                        u.Unset(p => p.ServalData.PreTranslationEngineId);
                    }
                    else
                    {
                        u.Unset(p => p.ServalData.TranslationEngineId);
                    }

                    if (!string.IsNullOrWhiteSpace(corporaId))
                    {
                        u.Unset(p => p.ServalData.Corpora[corporaId]);
                    }
                }
            );

            // Create the new translation engine id
            translationEngineId = await CreateServalProjectAsync(projectDoc.Data, preTranslate, cancellationToken);
            _logger.LogInformation($"Created Translation Engine {translationEngineId}.");
        }

        // Sync the corpus
        if ((await SyncProjectCorporaAsync(curUserId, buildConfig, preTranslate, cancellationToken)) || preTranslate)
        {
            // If the corpus was updated (or this is a pre-translation engine), start the build
            // We do not need the build ID for tracking as we use GetCurrentBuildAsync for that

            // Get the updated project secrets
            projectSecret = await _projectSecrets.GetAsync(buildConfig.ProjectId);

            // Get the appropriate translation engine
            TranslationBuildConfig translationBuildConfig;
            if (preTranslate)
            {
                translationEngineId = projectSecret.ServalData!.PreTranslationEngineId!;

                // Execute a complete pre-translation
                translationBuildConfig = await GetTranslationBuildConfigAsync(
                    projectSecret.ServalData,
                    projectDoc.Data.TranslateConfig.DraftConfig,
                    buildConfig
                );
            }
            else
            {
                translationEngineId = projectSecret.ServalData!.TranslationEngineId!;
                translationBuildConfig = new TranslationBuildConfig();
            }

            // Start the build
            TranslationBuild translationBuild = await _translationEnginesClient.StartBuildAsync(
                translationEngineId,
                translationBuildConfig,
                cancellationToken
            );

            // Clear the pre-translation queued status and job id
            if (preTranslate)
            {
                await _projectSecrets.UpdateAsync(
                    buildConfig.ProjectId,
                    u =>
                    {
                        u.Unset(p => p.ServalData.PreTranslationJobId);
                        u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                    }
                );
            }

            return translationBuild;
        }

        // No build started
        return null;
    }

    public async Task BuildProjectForBackgroundJobAsync(
        string curUserId,
        BuildConfig buildConfig,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        try
        {
            await BuildProjectAsync(curUserId, buildConfig, preTranslate, cancellationToken);
        }
        catch (TaskCanceledException e) when (e.InnerException is not TimeoutException)
        {
            // Do not log error - the job was cancelled
            // Exclude TaskCanceledException with an inner TimeoutException, as this generated by an HttpClient timeout

            // Ensure that the queued at timestamp is not present
            await _projectSecrets.UpdateAsync(
                buildConfig.ProjectId,
                u => u.Unset(p => p.ServalData.PreTranslationQueuedAt)
            );
        }
        catch (ServalApiException e) when (e.StatusCode == 409)
        {
            // A build is already in progress - clear the job details and do not record the error
            await _projectSecrets.UpdateAsync(
                buildConfig.ProjectId,
                u =>
                {
                    u.Unset(p => p.ServalData.PreTranslationJobId);
                    u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                }
            );
        }
        catch (Exception e)
        {
            // Log the error and report to bugsnag
            string message =
                $"Build exception occurred for project ${buildConfig.ProjectId} running in background job.";
            _logger.LogError(e, message);
            _exceptionHandler.ReportException(e);

            // Update the project secret with the error message
            await _projectSecrets.UpdateAsync(
                buildConfig.ProjectId,
                u =>
                {
                    u.Set(p => p.ServalData.PreTranslationErrorMessage, e.Message);
                    u.Unset(p => p.ServalData.PreTranslationJobId);
                    u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                }
            );
        }
    }

    public async Task RemoveProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Remove the project from the In Process Machine instance
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess) && !preTranslate)
        {
            await _engineService.RemoveProjectAsync(sfProjectId);
        }

        // Ensure that the Serval feature flag is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            _logger.LogInformation("Serval feature flag is not enabled");
            return;
        }

        // Load the target project secrets, so we can get the translation engine ID
        if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Ensure we have a translation engine id
        string translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            _logger.LogInformation($"No Translation Engine Id specified for project {sfProjectId}");
            return;
        }

        // Remove the corpus files
        foreach (
            (string corpusId, _) in projectSecret.ServalData.Corpora.Where(c => c.Value.PreTranslate == preTranslate)
        )
        {
            foreach (
                string fileId in projectSecret
                    .ServalData.Corpora[corpusId]
                    .SourceFiles.Concat(projectSecret.ServalData.Corpora[corpusId].TargetFiles)
                    .Select(f => f.FileId)
            )
            {
                try
                {
                    await _dataFilesClient.DeleteAsync(fileId, cancellationToken);
                }
                catch (ServalApiException e)
                {
                    // A 404 means that the file does not exist
                    string message;
                    if (e.StatusCode == StatusCodes.Status404NotFound)
                    {
                        message =
                            $"Corpora file {fileId} in corpus {corpusId} for project {sfProjectId}"
                            + " was missing or already deleted.";
                        _logger.LogInformation(message);
                    }
                    else
                    {
                        message =
                            $"Ignored exception while deleting file {fileId} in corpus {corpusId}"
                            + $" for project {sfProjectId}.";
                        _logger.LogError(e, message);
                    }
                }
            }

            // Delete the corpus
            try
            {
                await _translationEnginesClient.DeleteCorpusAsync(translationEngineId, corpusId, cancellationToken);
            }
            catch (ServalApiException e)
            {
                // A 404 means that the translation engine does not exist
                string message;
                if (e.StatusCode == StatusCodes.Status404NotFound)
                {
                    message =
                        $"Translation Engine {translationEngineId} for project {sfProjectId}"
                        + " was missing or already deleted.";
                    _logger.LogInformation(message);
                }
                else
                {
                    message =
                        $"Ignored exception while deleting translation engine {translationEngineId}"
                        + $" for project {sfProjectId}.";
                    _logger.LogError(e, message);
                }
            }

            // Remove our record of the corpus
            await _projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.Corpora[corpusId]));
        }

        // Remove the project from Serval
        await _translationEnginesClient.DeleteAsync(translationEngineId, cancellationToken);

        // Remove the Serval Data
        if (preTranslate)
        {
            await _projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.PreTranslationEngineId));
        }
        else
        {
            await _projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.TranslationEngineId));
        }
    }

    /// <summary>
    /// Syncs the project corpora from MongoDB to Serval via <see cref="SFTextCorpusFactory"/>
    /// </summary>
    /// <param name="curUserId">The current user identifier.</param>
    /// <param name="buildConfig">The build configuration.</param>
    /// <param name="preTranslate">The project is for pre-translation.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns><c>true</c> if the project corpora and its files were updated; otherwise, <c>false</c>.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    /// <remarks>
    /// Notes:
    ///  - If the corpus was updated, then you should start the Build with <see cref="BuildProjectAsync"/>.
    ///  - If the Serval feature flag is disabled, false is returned and an information message logged.
    ///  - If a corpus is not configured on Serval, one is created and recorded in the project secret.
    /// </remarks>
    public async Task<bool> SyncProjectCorporaAsync(
        string curUserId,
        BuildConfig buildConfig,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Used to return whether the corpus was updated
        bool corpusUpdated = false;

        // Ensure that the Serval feature flag is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            _logger.LogInformation("Serval feature flag is not enabled");
            return false;
        }

        // Load the project from the realtime service
        Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(buildConfig.ProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Load the project secrets, so we can get the corpus files
        if (!(await _projectSecrets.TryGetAsync(project.Id)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Ensure we have serval data
        if (projectSecret.ServalData is null)
        {
            throw new DataNotFoundException("The Serval data cannot be found.");
        }

        // Ensure we have a translation engine ID
        string translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            throw new DataNotFoundException("The translation engine ID cannot be found.");
        }

        // See if there is a translation corpus
        string? corpusId = projectSecret
            .ServalData.Corpora.FirstOrDefault(
                c => c.Value.PreTranslate == preTranslate && !c.Value.AlternateTrainingSource
            )
            .Key;

        // See if we are uploading a Paratext zip file
        bool uploadParatextZipFile =
            preTranslate
            && await _featureManager.IsEnabledAsync(FeatureFlags.UploadParatextZipForPreTranslation)
            && (corpusId == null || projectSecret.ServalData.Corpora[corpusId].UploadParatextZipFile);

        // See if there is a training corpus
        string? alternateTrainingSourceCorpusId = null;
        bool useAlternateTrainingSource =
            project.TranslateConfig.DraftConfig.AlternateTrainingSourceEnabled
            && project.TranslateConfig.DraftConfig.AlternateTrainingSource is not null
            && preTranslate;
        if (useAlternateTrainingSource)
        {
            alternateTrainingSourceCorpusId = projectSecret
                .ServalData.Corpora.FirstOrDefault(c => c.Value.PreTranslate && c.Value.AlternateTrainingSource)
                .Key;
        }

        // Get the files we have already synced
        var oldSourceCorpusFiles = new List<ServalCorpusFile>();
        if (!string.IsNullOrWhiteSpace(corpusId))
        {
            oldSourceCorpusFiles = projectSecret.ServalData.Corpora[corpusId].SourceFiles;
        }

        // Reuse the SFTextCorpusFactory implementation
        // This is only necessary for SMT suggestions or pre-Paratext zip support NMT projects
        IEnumerable<ISFText> texts = new List<ISFText>();
        if (!uploadParatextZipFile)
        {
            texts = await _textCorpusFactory.CreateAsync(
                new[] { project.Id },
                TextCorpusType.Source,
                preTranslate,
                useAlternateTrainingSource: false,
                buildConfig
            );
        }

        var newSourceCorpusFiles = new List<ServalCorpusFile>();
        corpusUpdated |= await UploadNewCorpusFilesAsync(
            project.Id,
            project.TranslateConfig.Source!.ParatextId,
            includeBlankSegments: true,
            uploadParatextZipFile,
            texts,
            oldSourceCorpusFiles,
            newSourceCorpusFiles,
            cancellationToken
        );

        // Get the files we have already synced
        var oldTargetCorpusFiles = new List<ServalCorpusFile>();
        if (!string.IsNullOrWhiteSpace(corpusId))
        {
            oldTargetCorpusFiles = projectSecret.ServalData.Corpora[corpusId].TargetFiles;
        }

        // Only specify the text corpus if we are not uploading to Paratext
        if (!uploadParatextZipFile)
        {
            texts = await _textCorpusFactory.CreateAsync(
                new[] { project.Id },
                TextCorpusType.Target,
                preTranslate,
                useAlternateTrainingSource: false,
                buildConfig
            );
        }

        List<ServalCorpusFile> newTargetCorpusFiles = new List<ServalCorpusFile>();
        corpusUpdated |= await UploadNewCorpusFilesAsync(
            project.Id,
            project.ParatextId,
            includeBlankSegments: preTranslate,
            uploadParatextZipFile,
            texts,
            oldTargetCorpusFiles,
            newTargetCorpusFiles,
            cancellationToken
        );

        // Upload the alternate training corpus
        List<ServalCorpusFile> newAlternateTrainingSourceCorpusFiles = new List<ServalCorpusFile>();
        if (useAlternateTrainingSource)
        {
            // Get the files we have already synced
            var oldAlternateTrainingSourceCorpusFiles = new List<ServalCorpusFile>();
            if (!string.IsNullOrWhiteSpace(alternateTrainingSourceCorpusId))
            {
                oldAlternateTrainingSourceCorpusFiles = projectSecret
                    .ServalData
                    .Corpora[alternateTrainingSourceCorpusId]
                    .SourceFiles;
            }

            // Only specify the text corpus if we are not uploading to Paratext
            if (!uploadParatextZipFile)
            {
                texts = await _textCorpusFactory.CreateAsync(
                    new[] { project.Id },
                    TextCorpusType.Source,
                    preTranslate,
                    useAlternateTrainingSource: true,
                    buildConfig
                );
            }

            corpusUpdated |= await UploadNewCorpusFilesAsync(
                project.Id,
                project.TranslateConfig.DraftConfig.AlternateTrainingSource.ParatextId,
                includeBlankSegments: true,
                uploadParatextZipFile,
                texts,
                oldAlternateTrainingSourceCorpusFiles,
                newAlternateTrainingSourceCorpusFiles,
                cancellationToken
            );
        }

        // Update the translation corpus
        corpusUpdated |= await UpdateCorpusConfigAsync(
            project,
            translationEngineId,
            corpusId,
            preTranslate,
            additionalTrainingData: false,
            useAlternateTrainingSource: false,
            uploadParatextZipFile,
            corpusUpdated,
            newSourceCorpusFiles,
            newTargetCorpusFiles,
            cancellationToken
        );

        // If we have a training corpus, update that (pre-translation only)
        if (useAlternateTrainingSource)
        {
            corpusUpdated |= await UpdateCorpusConfigAsync(
                project,
                translationEngineId,
                corpusId: alternateTrainingSourceCorpusId,
                preTranslate: true,
                additionalTrainingData: false,
                useAlternateTrainingSource: true,
                uploadParatextZipFile,
                corpusUpdated,
                sourceCorpusFiles: newAlternateTrainingSourceCorpusFiles,
                newTargetCorpusFiles,
                cancellationToken
            );
        }

        // See if we have an additional training data
        if (preTranslate && buildConfig.TrainingDataFiles.Any())
        {
            // Set up the collections required to upload the corpus data files
            var newTrainingDataSourceTexts = new List<ISFText>();
            var newTrainingDataTargetTexts = new List<ISFText>();
            var newTrainingDataSourceCorpusFiles = new List<ServalCorpusFile>();
            var newTrainingDataTargetCorpusFiles = new List<ServalCorpusFile>();
            var oldTrainingDataSourceCorpusFiles = new List<ServalCorpusFile>();
            var oldTrainingDataTargetCorpusFiles = new List<ServalCorpusFile>();

            // Get the training data texts
            await _trainingDataService.GetTextsAsync(
                curUserId,
                buildConfig.ProjectId,
                buildConfig.TrainingDataFiles,
                newTrainingDataSourceTexts,
                newTrainingDataTargetTexts
            );

            // Get the training data corpus id
            string trainingDataCorpusId = projectSecret
                .ServalData.Corpora.FirstOrDefault(c => c.Value.PreTranslate && c.Value.AdditionalTrainingData)
                .Key;

            // Get the training data files we have already synced
            if (!string.IsNullOrWhiteSpace(trainingDataCorpusId))
            {
                oldTrainingDataSourceCorpusFiles = projectSecret.ServalData.Corpora[trainingDataCorpusId].SourceFiles;
                oldTrainingDataTargetCorpusFiles = projectSecret.ServalData.Corpora[trainingDataCorpusId].TargetFiles;
            }

            // Upload the source files
            corpusUpdated |= await UploadNewCorpusFilesAsync(
                project.Id,
                project.ParatextId,
                includeBlankSegments: false,
                uploadParatextZipFile: false,
                newTrainingDataSourceTexts,
                oldTrainingDataSourceCorpusFiles,
                newTrainingDataSourceCorpusFiles,
                cancellationToken
            );

            // Upload the target files
            corpusUpdated |= await UploadNewCorpusFilesAsync(
                project.Id,
                project.ParatextId,
                includeBlankSegments: false,
                uploadParatextZipFile: false,
                newTrainingDataTargetTexts,
                oldTrainingDataTargetCorpusFiles,
                newTrainingDataTargetCorpusFiles,
                cancellationToken
            );

            // Update the training data corpus
            corpusUpdated |= await UpdateCorpusConfigAsync(
                project,
                translationEngineId,
                corpusId: trainingDataCorpusId,
                preTranslate: true,
                additionalTrainingData: true,
                useAlternateTrainingSource: false,
                uploadParatextZipFile: false,
                corpusUpdated,
                sourceCorpusFiles: newTrainingDataSourceCorpusFiles,
                targetCorpusFiles: newTrainingDataTargetCorpusFiles,
                cancellationToken
            );
        }

        return corpusUpdated;
    }

    /// <summary>
    /// Determines whether a translation engine exists for the specified project.
    /// </summary>
    /// <param name="projectId">The Scripture Forge project identifier.</param>
    /// <param name="translationEngineId">The Serval translation engine identifier.</param>
    /// <param name="preTranslate">The Serval translation engine identifier.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns></returns>
    public async Task<bool> TranslationEngineExistsAsync(
        string projectId,
        string? translationEngineId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            return false;
        }

        try
        {
            TranslationEngine translationEngine = await _translationEnginesClient.GetAsync(
                translationEngineId,
                cancellationToken
            );
            string type = await GetTranslationEngineTypeAsync(preTranslate);

            // We check for the type, taking account of Pascal Case (Serval 1.1) and Kebab Case (Serval 1.2)
            return translationEngine.Name == projectId
                && string.Equals(
                    translationEngine.Type.Replace("-", string.Empty),
                    type.Replace("-", string.Empty),
                    StringComparison.InvariantCultureIgnoreCase
                );
        }
        catch (ServalApiException e)
            when (e.StatusCode is StatusCodes.Status403Forbidden or StatusCodes.Status404NotFound)
        {
            return false;
        }
    }

    /// <summary>
    /// Gets the source language for the project.
    /// </summary>
    /// <param name="project">The project.</param>
    /// <param name="useAlternateTrainingSource">If <c>true</c>, use the alternate training source.</param>
    /// <returns>The source language.</returns>
    /// <exception cref="ArgumentNullException"></exception>
    private static string GetSourceLanguage(SFProject project, bool useAlternateTrainingSource)
    {
        if (useAlternateTrainingSource)
        {
            return project.TranslateConfig.DraftConfig.AlternateTrainingSource?.WritingSystem.Tag
                ?? project.TranslateConfig.DraftConfig.AlternateSource?.WritingSystem.Tag
                ?? project.TranslateConfig.Source?.WritingSystem.Tag
                ?? throw new ArgumentNullException(nameof(project));
        }

        return project.TranslateConfig.DraftConfig.AlternateSource?.WritingSystem.Tag
            ?? project.TranslateConfig.Source?.WritingSystem.Tag
            ?? throw new ArgumentNullException(nameof(project));
    }

    /// <summary>
    /// Gets the segments from the text with Unix/Linux line endings.
    /// </summary>
    /// <param name="text">The <see cref="ISFText"/>.</param>
    /// <param name="includeBlankSegments">
    /// <c>true</c> if we are to include blank segments (usually for a pre-translation target); otherwise <c>false</c>.
    /// </param>
    /// <returns>The text file data to be uploaded to Serval.</returns>
    private static string GetTextFileData(ISFText text, bool includeBlankSegments)
    {
        var sb = new StringBuilder();

        // For pre-translation, we must upload empty lines with segment refs for the correct references to be returned
        foreach (SFTextSegment segment in text.Segments.Where(s => !s.IsEmpty || includeBlankSegments))
        {
            // We pad the verse number so the string based key comparisons in Machine will be accurate.
            // If the int does not parse successfully, it will be because it is a Biblical Term - which has a Greek or
            // Hebrew word as the key, or because the verse number is unusual (i.e. 12a or 12-13). Usually the key is
            // a standard verse number, so will be at most in the hundreds.
            string key = segment.SegmentRef is TextSegmentRef textSegmentRef
                ? string.Join('_', textSegmentRef.Keys.Select(k => int.TryParse(k, out int _) ? k.PadLeft(3, '0') : k))
                : (string)segment.SegmentRef;

            // Strip characters from the key that will corrupt the line
            sb.Append(key.Replace('\n', '_').Replace('\t', '_'));
            sb.Append('\t');
            sb.Append(segment.SegmentText);
            sb.Append('\t');
            if (segment.IsSentenceStart)
            {
                sb.Append("ss,");
            }

            if (segment.IsInRange)
            {
                sb.Append("ir,");
            }

            if (segment.IsRangeStart)
            {
                sb.Append("rs,");
            }

            // Strip the last comma, or the tab if there are no flags
            sb.Length--;

            // Append the Unix EOL to ensure consistency as this text data is uploaded to Serval
            sb.Append('\n');
        }

        return sb.ToString();
    }

    /// <summary>
    /// Gets the TranslationBuildConfig for the specified ServalData object.
    /// </summary>
    /// <param name="servalData">The Serval data from <see cref="SFProjectSecret"/>.</param>
    /// <param name="draftConfig">
    /// The Draft configuration from <see cref="SFProject"/>.<see cref="TranslateConfig"/>.
    /// </param>
    /// <param name="buildConfig">The build configuration from the user, specified on the front end.</param>
    /// <returns>The TranslationBuildConfig for a Pre-Translate build.</returns>
    /// <remarks>Do not use with SMT builds.</remarks>
    private async Task<TranslationBuildConfig> GetTranslationBuildConfigAsync(
        ServalData servalData,
        DraftConfig draftConfig,
        BuildConfig buildConfig
    )
    {
        // Load the Serval Config from the Draft Config
        JObject? servalConfig = null;
        if (draftConfig.ServalConfig is not null)
        {
            servalConfig = JObject.Parse(draftConfig.ServalConfig);
        }

        // If Fast Training is enabled, override the max_steps
        if (buildConfig.FastTraining)
        {
            // Ensure that there is a servalConfig JSON object
            servalConfig ??= new JObject();

            // 20 is the number of steps used on Serval QA by default
            servalConfig["max_steps"] = 20;
        }

        // See if uploading Paratext Zip files is enabled
        bool uploadParatextZipFile = await _featureManager.IsEnabledAsync(
            FeatureFlags.UploadParatextZipForPreTranslation
        );

        // Set up the pre-translation and training corpora
        List<PretranslateCorpusConfig> preTranslate = new List<PretranslateCorpusConfig>();
        List<TrainingCorpusConfig>? trainOn = null;

        // Add the pre-translation books
        foreach (
            KeyValuePair<string, ServalCorpus> corpus in servalData.Corpora.Where(
                s => s.Value.PreTranslate && !s.Value.AlternateTrainingSource && !s.Value.AdditionalTrainingData
            )
        )
        {
            var preTranslateCorpusConfig = new PretranslateCorpusConfig { CorpusId = corpus.Key };

            // If this is a Paratext zip file corpus, and the feature flag is enabled
            if (uploadParatextZipFile && corpus.Value.UploadParatextZipFile)
            {
                // Since all books are uploaded via the zip file, we need to specify the target books to translate
                preTranslateCorpusConfig.TextIds = buildConfig.TranslationBooks.Select(Canon.BookNumberToId).ToList();

                if (!draftConfig.AlternateTrainingSourceEnabled)
                {
                    // As we do not have an alternate train on source specified, use the source texts to train on
                    trainOn ??= new List<TrainingCorpusConfig>();
                    trainOn.Add(
                        new TrainingCorpusConfig
                        {
                            CorpusId = corpus.Key,
                            TextIds = buildConfig.TrainingBooks.Select(Canon.BookNumberToId).ToList(),
                        }
                    );
                }
            }

            preTranslate.Add(preTranslateCorpusConfig);
        }

        // Add the alternate training source, if enabled
        if (draftConfig.AlternateTrainingSourceEnabled)
        {
            trainOn = new List<TrainingCorpusConfig>();
            foreach (
                KeyValuePair<string, ServalCorpus> corpus in servalData.Corpora.Where(
                    s => s.Value.PreTranslate && s.Value.AlternateTrainingSource
                )
            )
            {
                var trainingCorpusConfig = new TrainingCorpusConfig { CorpusId = corpus.Key };
                if (uploadParatextZipFile && corpus.Value.UploadParatextZipFile)
                {
                    // As all books are uploaded via the zip file, specify the source books to train on
                    trainingCorpusConfig.TextIds = buildConfig.TrainingBooks.Select(Canon.BookNumberToId).ToList();
                }

                trainOn.Add(trainingCorpusConfig);
            }
        }

        var translationBuildConfig = new TranslationBuildConfig
        {
            Options = servalConfig,
            Pretranslate = preTranslate,
            TrainOn = trainOn,
        };

        // Add the additional training data, if applicable
        if (buildConfig.TrainingDataFiles.Any())
        {
            if (draftConfig.AlternateTrainingSourceEnabled)
            {
                // Include the additional training data with the alternate training corpora
                translationBuildConfig.TrainOn.AddRange(
                    servalData
                        .Corpora.Where(s => s.Value.PreTranslate && s.Value.AdditionalTrainingData)
                        .Select(c => new TrainingCorpusConfig { CorpusId = c.Key })
                        .ToList()
                );
            }
            else
            {
                // Include the additional training data with the pre-translate/training corpora
                translationBuildConfig.Pretranslate.AddRange(
                    servalData
                        .Corpora.Where(s => s.Value.PreTranslate && s.Value.AdditionalTrainingData)
                        .Select(c => new PretranslateCorpusConfig { CorpusId = c.Key })
                        .ToList()
                );
            }
        }

        return translationBuildConfig;
    }

    /// <summary>
    /// Creates a project in Serval.
    /// </summary>
    /// <param name="sfProject">The Scripture Forge project</param>
    /// <param name="preTranslate">The project is for pre-translation.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The translation engine id.</returns>
    /// <exception cref="DataNotFoundException">The translation engine could not be created.</exception>
    private async Task<string> CreateServalProjectAsync(
        SFProject sfProject,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Get the existing project secret, so we can see how to create the engine and update the Serval data
        SFProjectSecret projectSecret = await _projectSecrets.GetAsync(sfProject.Id);
        string translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            TranslationEngineConfig engineConfig = new TranslationEngineConfig
            {
                Name = sfProject.Id,
                SourceLanguage = GetSourceLanguage(sfProject, useAlternateTrainingSource: false),
                TargetLanguage = await GetTargetLanguageAsync(sfProject),
                Type = await GetTranslationEngineTypeAsync(preTranslate),
            };

            // Add the project to Serval
            TranslationEngine translationEngine = await _translationEnginesClient.CreateAsync(
                engineConfig,
                cancellationToken
            );
            if (string.IsNullOrWhiteSpace(translationEngine.Id))
            {
                throw new DataNotFoundException("Translation Engine ID from Serval is missing.");
            }

            // Get the new translation engine id
            translationEngineId = translationEngine.Id;

            if (projectSecret.ServalData is not null && preTranslate)
            {
                // Store the Pre-Translation Engine ID
                await _projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData.PreTranslationEngineId, translationEngine.Id)
                );
            }
            else if (projectSecret.ServalData is not null)
            {
                // Store the Translation Engine ID
                await _projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData.TranslationEngineId, translationEngine.Id)
                );
            }
            else if (preTranslate)
            {
                // Store the Pre-Translation Engine ID
                await _projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData, new ServalData { PreTranslationEngineId = translationEngine.Id })
                );
            }
            else
            {
                // Store the Translation Engine ID
                await _projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData, new ServalData { TranslationEngineId = translationEngine.Id })
                );
            }
        }

        return translationEngineId;
    }

    private async Task<bool> UploadFileAsync(
        string textId,
        string textFileData,
        FileFormat fileFormat,
        ICollection<ServalCorpusFile>? oldCorpusFiles,
        ICollection<ServalCorpusFile> newCorpusFiles,
        CancellationToken cancellationToken
    )
    {
        byte[] buffer = Encoding.UTF8.GetBytes(textFileData);
        await using Stream stream = new MemoryStream(buffer, false);
        return await UploadFileAsync(textId, stream, fileFormat, oldCorpusFiles, newCorpusFiles, cancellationToken);
    }

    private async Task<bool> UploadFileAsync(
        string textId,
        Stream stream,
        FileFormat fileFormat,
        ICollection<ServalCorpusFile>? oldCorpusFiles,
        ICollection<ServalCorpusFile> newCorpusFiles,
        CancellationToken cancellationToken
    )
    {
        // See if the corpus exists and update it if it is missing, or if the checksum has changed
        bool uploadText = false;

        // Reset the stream to the start
        stream.Seek(0, SeekOrigin.Begin);

        // Calculate the checksum from the stream
        using MD5 md5 = MD5.Create();
        StringBuilder sb = new StringBuilder();
        foreach (var hashByte in await md5.ComputeHashAsync(stream, cancellationToken))
        {
            sb.Append(hashByte.ToString("X2").ToLower());
        }

        // Upload the file if it is not there or has changed
        string checksum = sb.ToString();
        ServalCorpusFile? previousCorpusFile = oldCorpusFiles?.FirstOrDefault(c => c.TextId == textId);
        if (previousCorpusFile is null || previousCorpusFile.FileChecksum != checksum)
        {
            uploadText = true;
        }

        // No update, so do not upload
        if (!uploadText)
        {
            newCorpusFiles.Add(previousCorpusFile);
            return false;
        }

        // Reset the stream to the start
        stream.Seek(0, SeekOrigin.Begin);

        // Upload the file
        DataFile dataFile;
        if (previousCorpusFile is null)
        {
            dataFile = await _dataFilesClient.CreateAsync(
                new FileParameter(stream),
                fileFormat,
                textId,
                cancellationToken
            );
        }
        else
        {
            // See if the file exists, and it is the same format
            bool dataFileExists;
            try
            {
                dataFile = await _dataFilesClient.GetAsync(previousCorpusFile.FileId, cancellationToken);
                dataFileExists = dataFile.Format == fileFormat;
            }
            catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
            {
                _logger.LogInformation($"File {previousCorpusFile.FileId} does not exist - creating.");
                dataFileExists = false;
            }

            // Update the file if it exists, otherwise create it
            dataFile = dataFileExists
                ? await _dataFilesClient.UpdateAsync(
                    previousCorpusFile.FileId,
                    new FileParameter(stream),
                    cancellationToken
                )
                : await _dataFilesClient.CreateAsync(new FileParameter(stream), fileFormat, textId, cancellationToken);
        }

        newCorpusFiles.Add(
            new ServalCorpusFile
            {
                FileChecksum = checksum,
                FileId = dataFile.Id,
                TextId = textId,
            }
        );

        return true;
    }

    /// <summary>
    /// Gets the target language for the project
    /// </summary>
    /// <param name="project">The project.</param>
    /// <returns>The target language.</returns>
    /// <exception cref="ArgumentNullException"></exception>
    private async Task<string> GetTargetLanguageAsync(SFProject project)
    {
        // Echo requires the target and source language to be the same, as it outputs your source texts
        bool useEcho = await _featureManager.IsEnabledAsync(FeatureFlags.UseEchoForPreTranslation);
        return useEcho ? GetSourceLanguage(project, useAlternateTrainingSource: false) : project.WritingSystem.Tag;
    }

    /// <summary>
    /// Gets the translation engine type string for Serval.
    /// </summary>
    /// <param name="preTranslate">If <c>true</c>, then the translation engine is for pre-translation.</param>
    /// <returns>The translation engine type string for Serval.</returns>
    private async Task<string> GetTranslationEngineTypeAsync(bool preTranslate)
    {
        bool useEcho = await _featureManager.IsEnabledAsync(FeatureFlags.UseEchoForPreTranslation);
        return preTranslate switch
        {
            true when useEcho => Echo,
            true => Nmt,
            false => SmtTransfer,
        };
    }

    /// <summary>
    /// Updates the corpus configuration in the project secrets.
    /// </summary>
    /// <param name="project">The project.</param>
    /// <param name="translationEngineId">The translation engine identifier.</param>
    /// <param name="corpusId">The corpus identifier. If <c>null</c>, a new corpus is created.</param>
    /// <param name="preTranslate">The project is for pre-translation.</param>
    /// <param name="additionalTrainingData">If <c>true</c>, this is the additional training data corpus.</param>
    /// <param name="useAlternateTrainingSource">If <c>true</c>, use the alternate training source.</param>
    /// <param name="uploadParatextZipFile">A Paratext zip file was used for the upload.</param>
    /// <param name="corpusUpdated">The files in the corpus have been updated.</param>
    /// <param name="sourceCorpusFiles">The source corpus files.</param>
    /// <param name="targetCorpusFiles">The target corpus files.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns><c>true</c> if the corpus was updated; otherwise, <c>false</c>.</returns>
    private async Task<bool> UpdateCorpusConfigAsync(
        SFProject project,
        string translationEngineId,
        string? corpusId,
        bool preTranslate,
        bool additionalTrainingData,
        bool useAlternateTrainingSource,
        bool uploadParatextZipFile,
        bool corpusUpdated,
        List<ServalCorpusFile> sourceCorpusFiles,
        List<ServalCorpusFile> targetCorpusFiles,
        CancellationToken cancellationToken
    )
    {
        // Create or update the corpus
        TranslationCorpus corpus;
        TranslationCorpusConfig corpusConfig = new TranslationCorpusConfig
        {
            Name = project.Id,
            SourceFiles = sourceCorpusFiles
                .Select(f => new TranslationCorpusFileConfig { FileId = f.FileId, TextId = f.TextId })
                .ToList(),
            SourceLanguage = GetSourceLanguage(project, useAlternateTrainingSource),
            TargetFiles = targetCorpusFiles
                .Select(f => new TranslationCorpusFileConfig { FileId = f.FileId, TextId = f.TextId })
                .ToList(),
            TargetLanguage = await GetTargetLanguageAsync(project),
        };

        // See if we need to create or update the corpus
        if (string.IsNullOrEmpty(corpusId))
        {
            corpus = await _translationEnginesClient.AddCorpusAsync(
                translationEngineId,
                corpusConfig,
                cancellationToken
            );
        }
        else
        {
            // Get the corpus to see if the language has changed
            bool createCorpus;
            bool deleteCorpus;
            try
            {
                corpus = await _translationEnginesClient.GetCorpusAsync(
                    translationEngineId,
                    corpusId,
                    cancellationToken
                );
                createCorpus =
                    corpus.SourceLanguage != corpusConfig.SourceLanguage
                    || corpus.TargetLanguage != corpusConfig.TargetLanguage;
                deleteCorpus = createCorpus;
            }
            catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
            {
                // A 404 means that the translation engine does not exist
                _logger.LogInformation(
                    $"Corpus {corpusId} in Translation Engine {translationEngineId} does not exist."
                );
                createCorpus = true;
                deleteCorpus = false;
            }

            // The language has changed, or the corpus is missing
            if (createCorpus)
            {
                // Delete the old corpus
                if (deleteCorpus)
                {
                    await _translationEnginesClient.DeleteCorpusAsync(translationEngineId, corpusId, cancellationToken);
                }

                // Recreate the corpus
                corpus = await _translationEnginesClient.AddCorpusAsync(
                    translationEngineId,
                    corpusConfig,
                    cancellationToken
                );
            }
            else if (corpusUpdated)
            {
                // Update the corpus
                TranslationCorpusUpdateConfig corpusUpdateConfig = new TranslationCorpusUpdateConfig
                {
                    SourceFiles = corpusConfig.SourceFiles,
                    TargetFiles = corpusConfig.TargetFiles,
                };
                corpus = await _translationEnginesClient.UpdateCorpusAsync(
                    translationEngineId,
                    corpusId,
                    corpusUpdateConfig,
                    cancellationToken
                );
            }
            else
            {
                // The corpus was not updated
                return false;
            }
        }

        // Update the project secret with the new corpus information
        await _projectSecrets.UpdateAsync(
            project.Id,
            u =>
                u.Set(
                    p => p.ServalData.Corpora[corpus.Id],
                    new ServalCorpus
                    {
                        SourceFiles = sourceCorpusFiles,
                        TargetFiles = targetCorpusFiles,
                        PreTranslate = preTranslate,
                        AdditionalTrainingData = additionalTrainingData,
                        AlternateTrainingSource = useAlternateTrainingSource,
                        UploadParatextZipFile = uploadParatextZipFile,
                    }
                )
        );

        return true;
    }

    /// <summary>
    /// Syncs a collection of <see cref="ISFText"/> to Serval, creating files on Serval as necessary.
    /// </summary>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="paratextId">The Paratext identifier.</param>
    /// <param name="includeBlankSegments">
    /// <c>true</c> if we are to include blank segments (usually for a pre-translation target); otherwise <c>false</c>.
    /// This is not used if <paramref name="uploadParatextZipFile"/> is <c>true</c>.
    /// </param>
    /// <param name="uploadParatextZipFile">
    /// <c>true</c> if we are uploading a Paratext zip file; otherwise <c>false</c>.
    /// </param>
    /// <param name="texts">The texts created by <see cref="SFTextCorpusFactory"/>.</param>
    /// <param name="oldCorpusFiles">The existing corpus files (optional).</param>
    /// <param name="newCorpusFiles">The updated list of corpus files.</param>
    /// <param name="cancellationToken"></param>
    /// <returns><c>true</c> if the corpus was created or updated; otherwise, <c>false</c>.</returns>
    /// <remarks>
    /// The project secret is updated with the corpus file details added to or removed from Serval.
    /// </remarks>
    private async Task<bool> UploadNewCorpusFilesAsync(
        string projectId,
        string paratextId,
        bool includeBlankSegments,
        bool uploadParatextZipFile,
        IEnumerable<ISFText> texts,
        ICollection<ServalCorpusFile>? oldCorpusFiles,
        ICollection<ServalCorpusFile> newCorpusFiles,
        CancellationToken cancellationToken
    )
    {
        // Used to return whether the corpus files were created or updated
        bool corpusUpdated = false;

        // Upload the Paratext zip file, if we are supposed to
        if (uploadParatextZipFile)
        {
            // Get the path to the Paratext directory
            string path = Path.Combine(_siteOptions.Value.SiteDir, "sync", paratextId, "target");

            // Ensure that the path exists
            if (!_fileSystemService.DirectoryExists(path))
            {
                throw new DirectoryNotFoundException($"The following directory could not be found: {path}");
            }

            // Create the zip file from the directory in memory
            await using var memoryStream = new MemoryStream();
            using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
            {
                // Do not convert the ZipArchive using statement above into a using declaration,
                // otherwise the ZipArchive disposal will crash after the MemoryStream disposal.
                foreach (string filePath in _fileSystemService.EnumerateFiles(path))
                {
                    await using Stream fileStream = _fileSystemService.OpenFile(filePath, FileMode.Open);
                    ZipArchiveEntry entry = archive.CreateEntry(Path.GetFileName(filePath));
                    await using Stream entryStream = entry.Open();
                    await fileStream.CopyToAsync(entryStream, cancellationToken);
                }
            }

            // Upload the zip file
            corpusUpdated = await UploadFileAsync(
                projectId,
                memoryStream,
                FileFormat.Paratext,
                oldCorpusFiles,
                newCorpusFiles,
                cancellationToken
            );
        }
        else
        {
            // Sync each text
            foreach (ISFText text in texts)
            {
                string textFileData = GetTextFileData(text, includeBlankSegments);
                if (!string.IsNullOrWhiteSpace(textFileData))
                {
                    // Remove the project id from the start of the text id (if present)
                    string textId = text.Id.StartsWith($"{projectId}_") ? text.Id[(projectId.Length + 1)..] : text.Id;

                    // Upload the text file
                    corpusUpdated |= await UploadFileAsync(
                        textId,
                        textFileData,
                        FileFormat.Text,
                        oldCorpusFiles,
                        newCorpusFiles,
                        cancellationToken
                    );
                }
            }
        }

        // Delete corpus files for removed texts
        if (oldCorpusFiles is not null)
        {
            foreach (var corpusFile in oldCorpusFiles.Where(c => newCorpusFiles.All(n => n.FileId != c.FileId)))
            {
                try
                {
                    await _dataFilesClient.DeleteAsync(corpusFile.FileId, cancellationToken);
                }
                catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
                {
                    // If the file was already deleted, just log a message
                    string message =
                        $"Corpora file {corpusFile.FileId} for text {corpusFile.TextId} in project {projectId}"
                        + " was missing or already deleted.";
                    _logger.LogInformation(e, message);
                }

                corpusUpdated = true;
            }
        }

        return corpusUpdated;
    }
}
