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
/// Provides functionality to add, remove, and build Machine projects.
/// </summary>
public class MachineProjectService(
    IDataFilesClient dataFilesClient,
    IExceptionHandler exceptionHandler,
    IFeatureManager featureManager,
    IFileSystemService fileSystemService,
    ILogger<MachineProjectService> logger,
    IParatextService paratextService,
    IRepository<SFProjectSecret> projectSecrets,
    IRealtimeService realtimeService,
    IOptions<SiteOptions> siteOptions,
    ITrainingDataService trainingDataService,
    ITranslationEnginesClient translationEnginesClient,
    IRepository<UserSecret> userSecrets
) : IMachineProjectService
{
    // Supported translation engines (Serval 1.2 format)
    // Serval 1.2 accepts the translation engine type in 1.1 (PascalCase) and 1.2 (kebab-case) format
    internal const string Echo = "echo";
    internal const string Nmt = "nmt";
    internal const string SmtTransfer = "smt-transfer";

    public async Task<string> AddProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // We may not have the source language tag or target language tag if either is a back translation
        // If that is the case, we will create the translation engine on first sync by running this method again
        // After ensuring that the source and target language tags are present
        if (
            !string.IsNullOrWhiteSpace(project.TranslateConfig.Source?.WritingSystem.Tag)
            && !string.IsNullOrWhiteSpace(project.WritingSystem.Tag)
        )
        {
            return await CreateServalProjectAsync(project, preTranslate, cancellationToken);
        }

        logger.LogInformation("The source or target language is missing from the project");
        return string.Empty;
    }

    public async Task<TranslationBuild?> BuildProjectAsync(
        string curUserId,
        BuildConfig buildConfig,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Load the target project secrets, so we can get the translation engine ID
        if (!(await projectSecrets.TryGetAsync(buildConfig.ProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Load the project from the realtime service
        await using IConnection conn = await realtimeService.ConnectAsync(curUserId);
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
                Attempt<UserSecret> userSecretAttempt = await userSecrets.TryGetAsync(curUserId);
                if (!userSecretAttempt.TryResult(out UserSecret userSecret))
                    throw new DataNotFoundException("The user does not exist.");

                // This error can occur if the project is deleted while the build is running
                if (projectDoc.Data is null)
                {
                    throw new DataNotFoundException("The project does not exist.");
                }

                // Update the target writing system tag
                if (string.IsNullOrWhiteSpace(projectDoc.Data.WritingSystem.Tag))
                {
                    WritingSystem writingSystem = paratextService.GetWritingSystem(
                        userSecret,
                        projectDoc.Data.ParatextId
                    );
                    if (!string.IsNullOrEmpty(writingSystem.Tag))
                    {
                        await projectDoc.SubmitJson0OpAsync(op =>
                        {
                            op.Set(p => p.WritingSystem.Region, writingSystem.Region);
                            op.Set(p => p.WritingSystem.Script, writingSystem.Script);
                            op.Set(p => p.WritingSystem.Tag, writingSystem.Tag);
                        });
                    }
                }

                // This error can occur if the project is deleted while the build is running
                if (projectDoc.Data is null)
                {
                    throw new DataNotFoundException("The project does not exist.");
                }

                // This error can occur if the project source is cleared while the build is running
                if (projectDoc.Data.TranslateConfig.Source is null)
                {
                    throw new DataNotFoundException("The project source is not specified.");
                }

                // Update the source writing system tag
                if (string.IsNullOrWhiteSpace(projectDoc.Data.TranslateConfig.Source.WritingSystem.Tag))
                {
                    WritingSystem writingSystem = paratextService.GetWritingSystem(
                        userSecret,
                        projectDoc.Data.TranslateConfig.Source.ParatextId
                    );
                    if (!string.IsNullOrEmpty(writingSystem.Tag))
                    {
                        await projectDoc.SubmitJson0OpAsync(op =>
                            op.Set(p => p.TranslateConfig.Source.WritingSystem.Tag, writingSystem.Tag)
                        );
                    }
                }
            }

            // Clear the existing translation engine id and corpora, based on whether this is pre-translation or not
            string[] corporaIds =
                projectSecret
                    .ServalData?.Corpora.Where(c => preTranslate ? c.Value.PreTranslate : !c.Value.PreTranslate)
                    .Select(c => c.Key)
                    .ToArray() ?? [];
            await projectSecrets.UpdateAsync(
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

            // Create the Serval project, and get the translation engine id
            translationEngineId = await CreateServalProjectAsync(projectDoc.Data, preTranslate, cancellationToken);
        }

        // Ensure a translation engine id is present
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            throw new DataNotFoundException("The translation engine is not specified.");
        }

        // Get the translation engine from Serval
        try
        {
            TranslationEngine translationEngine = await translationEnginesClient.GetAsync(
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
                logger.LogInformation(message);
                recreateTranslationEngine = true;
            }

            // See if the source language has changed
            string projectSourceLanguage = GetSourceLanguage(projectDoc.Data, useAlternateTrainingSource: false);
            if (translationEngine.SourceLanguage != projectSourceLanguage)
            {
                string message =
                    $"Source language has changed from {translationEngine.SourceLanguage} to {projectSourceLanguage}.";
                logger.LogInformation(message);
                recreateTranslationEngine = true;
            }

            // Delete then recreate the translation engine if they have changed
            if (recreateTranslationEngine)
            {
                // Removal can be a slow process
                await RemoveProjectAsync(curUserId, buildConfig.ProjectId, preTranslate, cancellationToken);
                await AddProjectAsync(curUserId, buildConfig.ProjectId, preTranslate, cancellationToken);
            }
        }
        catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
        {
            // A 404 means that the translation engine does not exist
            logger.LogInformation($"Translation Engine {translationEngineId} does not exist.");
            string? corporaId = projectSecret
                .ServalData?.Corpora.FirstOrDefault(c => preTranslate ? c.Value.PreTranslate : !c.Value.PreTranslate)
                .Key;
            // Clear the existing translation engine id and corpora
            await projectSecrets.UpdateAsync(
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
            logger.LogInformation($"Created Translation Engine {translationEngineId}.");
        }

        // Sync the corpus
        if ((await SyncProjectCorporaAsync(curUserId, buildConfig, preTranslate, cancellationToken)) || preTranslate)
        {
            // If the corpus was updated (or this is a pre-translation engine), start the build
            // We do not need the build ID for tracking as we use GetCurrentBuildAsync for that

            // Get the updated project secrets
            projectSecret = await projectSecrets.GetAsync(buildConfig.ProjectId);

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
            TranslationBuild translationBuild = await translationEnginesClient.StartBuildAsync(
                translationEngineId,
                translationBuildConfig,
                cancellationToken
            );

            // Clear the queued status and job id
            await projectSecrets.UpdateAsync(
                buildConfig.ProjectId,
                u =>
                {
                    if (preTranslate)
                    {
                        u.Unset(p => p.ServalData.PreTranslationJobId);
                        u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                    }
                    else
                    {
                        u.Unset(p => p.ServalData.TranslationJobId);
                        u.Unset(p => p.ServalData.TranslationQueuedAt);
                    }
                }
            );

            return translationBuild;
        }

        // No build started
        return null;
    }

    [Mutex]
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
            await projectSecrets.UpdateAsync(
                buildConfig.ProjectId,
                u =>
                {
                    if (preTranslate)
                    {
                        u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                    }
                    else
                    {
                        u.Unset(p => p.ServalData.TranslationQueuedAt);
                    }
                }
            );
        }
        catch (ServalApiException e) when (e.StatusCode == 409)
        {
            // A build is already in progress - clear the job details and don't record the error
            await projectSecrets.UpdateAsync(
                buildConfig.ProjectId,
                u =>
                {
                    if (preTranslate)
                    {
                        u.Unset(p => p.ServalData.PreTranslationJobId);
                        u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                    }
                    else
                    {
                        u.Unset(p => p.ServalData.TranslationJobId);
                        u.Unset(p => p.ServalData.TranslationQueuedAt);
                    }
                }
            );
        }
        catch (DataNotFoundException e)
        {
            // This will occur if the project is deleted while the job is running
            string message =
                $"Build DataNotFoundException occurred for project {buildConfig.ProjectId} running in background job.";
            logger.LogWarning(e, message);
        }
        catch (Exception e)
        {
            // Log the error and report to bugsnag
            string message = $"Build exception occurred for project {buildConfig.ProjectId} running in background job.";
            logger.LogError(e, message);
            exceptionHandler.ReportException(e);

            // Update the project secret with the error message
            await projectSecrets.UpdateAsync(
                buildConfig.ProjectId,
                u =>
                {
                    if (preTranslate)
                    {
                        u.Set(p => p.ServalData.PreTranslationErrorMessage, e.Message);
                        u.Unset(p => p.ServalData.PreTranslationJobId);
                        u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                    }
                    else
                    {
                        u.Set(p => p.ServalData.TranslationErrorMessage, e.Message);
                        u.Unset(p => p.ServalData.TranslationJobId);
                        u.Unset(p => p.ServalData.TranslationQueuedAt);
                    }
                }
            );
        }
    }

    /// <summary>
    /// Gets the project as a zip file, writing it to <paramref name="outputStream"/>.
    /// </summary>
    /// <param name="sfProjectId">The Scripture Forge project identifier.</param>
    /// <param name="outputStream">The output stream.</param>
    /// <param name="cancellationToken">The cancellation token.</param>
    /// <returns>The name of the zip file, e.g. <c>ABC.zip</c>.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist, is a resource, or could not be found on disk.</exception>
    public async Task<string> GetProjectZipAsync(
        string sfProjectId,
        Stream outputStream,
        CancellationToken cancellationToken
    )
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure that the project is not a resource
        if (paratextService.IsResource(project.ParatextId))
        {
            throw new DataNotFoundException("You cannot download a resource.");
        }

        // Get the path to the Paratext directory
        string path = Path.Combine(siteOptions.Value.SiteDir, "sync", project.ParatextId, "target");

        // Ensure that the path exists
        if (!fileSystemService.DirectoryExists(path))
        {
            throw new DataNotFoundException($"The directory could not be found for {project.ParatextId}");
        }

        // Create the zip file from the directory in memory
        using var archive = new ZipArchive(outputStream, ZipArchiveMode.Create, true);
        foreach (string filePath in fileSystemService.EnumerateFiles(path))
        {
            await using Stream fileStream = fileSystemService.OpenFile(filePath, FileMode.Open);
            ZipArchiveEntry entry = archive.CreateEntry(Path.GetFileName(filePath));
            await using Stream entryStream = entry.Open();
            await fileStream.CopyToAsync(entryStream, cancellationToken);
        }

        // Strip invalid characters from the file name
        string fileName = Path.GetInvalidFileNameChars()
            .Aggregate(project.ShortName, (current, c) => current.Replace(c.ToString(), string.Empty));
        return $"{fileName}.zip";
    }

    /// <summary>
    /// Gets the translation engine type string for Serval.
    /// </summary>
    /// <param name="preTranslate">If <c>true</c>, then the translation engine is for pre-translation.</param>
    /// <returns>The translation engine type string for Serval.</returns>
    public async Task<string> GetTranslationEngineTypeAsync(bool preTranslate)
    {
        bool useEcho = await featureManager.IsEnabledAsync(FeatureFlags.UseEchoForPreTranslation);
        return preTranslate switch
        {
            true when useEcho => Echo,
            true => Nmt,
            false => SmtTransfer,
        };
    }

    public async Task RemoveProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        // Load the target project secrets, so we can get the translation engine ID
        if (!(await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new DataNotFoundException("The project secret cannot be found.");
        }

        // Ensure we have a translation engine id
        string translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            logger.LogInformation($"No Translation Engine Id specified for project {sfProjectId}");
            return;
        }

        // Remove the corpora and files
        foreach (
            (string corpusId, _) in projectSecret.ServalData.Corpora.Where(c => c.Value.PreTranslate == preTranslate)
        )
        {
            // Delete the corpus
            try
            {
                await translationEnginesClient.DeleteCorpusAsync(
                    translationEngineId,
                    corpusId,
                    deleteFiles: true,
                    cancellationToken
                );
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
                    logger.LogInformation(message);
                }
                else
                {
                    message =
                        $"Ignored exception while deleting translation engine {translationEngineId}"
                        + $" for project {sfProjectId}.";
                    logger.LogError(e, message);
                }
            }

            // Remove our record of the corpus
            await projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.Corpora[corpusId]));
        }

        // Remove the project from Serval
        await translationEnginesClient.DeleteAsync(translationEngineId, cancellationToken);

        // Remove the Serval Data
        if (preTranslate)
        {
            await projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.PreTranslationEngineId));
        }
        else
        {
            await projectSecrets.UpdateAsync(sfProjectId, u => u.Unset(p => p.ServalData.TranslationEngineId));
        }
    }

    /// <summary>
    /// Syncs the project corpora from the file system to Serval.
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
    ///  - If a corpus is not configured on Serval, one is created and recorded in the project secret.
    ///  - Any corpus files without project ids will be deleted and recreated with project ids.
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

        // Load the project from the realtime service
        Attempt<SFProject> attempt = await realtimeService.TryGetSnapshotAsync<SFProject>(buildConfig.ProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure we have a source
        if (project.TranslateConfig.Source is null)
        {
            throw new DataNotFoundException("The project source is not specified.");
        }

        // Load the project secrets, so we can get the corpus files
        if (!(await projectSecrets.TryGetAsync(project.Id)).TryResult(out SFProjectSecret projectSecret))
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
            .ServalData.Corpora.FirstOrDefault(c =>
                c.Value.PreTranslate == preTranslate && !c.Value.AlternateTrainingSource
            )
            .Key;

        // See if there is an alternate source to use for drafting
        bool useAlternateSource =
            project.TranslateConfig.DraftConfig.AlternateSourceEnabled
            && project.TranslateConfig.DraftConfig.AlternateSource is not null
            && preTranslate;

        // See if there is an alternate training source corpus
        bool useAlternateTrainingSource =
            project.TranslateConfig.DraftConfig.AlternateTrainingSourceEnabled
            && project.TranslateConfig.DraftConfig.AlternateTrainingSource is not null
            && preTranslate;

        // See if there is an additional training source
        bool useAdditionalTrainingSource =
            project.TranslateConfig.DraftConfig.AdditionalTrainingSourceEnabled
            && project.TranslateConfig.DraftConfig.AdditionalTrainingSource is not null
            && preTranslate;

        // Get the alternate training source corpus id, if present
        string? alternateTrainingSourceCorpusId = projectSecret
            .ServalData.Corpora.FirstOrDefault(c => c.Value.PreTranslate && c.Value.AlternateTrainingSource)
            .Key;

        // If we are to use the alternate source, only use it for drafting
        bool useSourceAsAlternateTrainingSource = false;
        string sourceProjectId = project.TranslateConfig.Source.ProjectRef;
        string sourceParatextId = project.TranslateConfig.Source.ParatextId;
        if (useAlternateSource)
        {
            sourceProjectId = project.TranslateConfig.DraftConfig.AlternateSource.ProjectRef;
            sourceParatextId = project.TranslateConfig.DraftConfig.AlternateSource.ParatextId;

            // If we do not have an alternate training source, use the reference source for training
            useSourceAsAlternateTrainingSource = !useAlternateTrainingSource;
        }

        // Get the files we have already synced
        List<ServalCorpusFile> oldSourceCorpusFiles = [];
        List<ServalCorpusFile> oldTargetCorpusFiles = [];
        List<ServalCorpusFile> newTargetCorpusFiles = [];
        List<ServalCorpusFile> newSourceCorpusFiles = [];
        if (!string.IsNullOrWhiteSpace(corpusId))
        {
            oldSourceCorpusFiles = projectSecret.ServalData.Corpora[corpusId].SourceFiles;
            oldTargetCorpusFiles = projectSecret.ServalData.Corpora[corpusId].TargetFiles;
        }

        // Upload the translation source
        corpusUpdated |= await UploadNewCorpusFilesAsync(
            targetProjectId: project.Id,
            sourceProjectId,
            paratextId: sourceParatextId,
            uploadParatextZipFile: true,
            texts: [],
            oldSourceCorpusFiles,
            newSourceCorpusFiles,
            cancellationToken
        );

        // Upload the translation target
        corpusUpdated |= await UploadNewCorpusFilesAsync(
            targetProjectId: project.Id,
            sourceProjectId: project.Id,
            project.ParatextId,
            uploadParatextZipFile: true,
            texts: [],
            oldTargetCorpusFiles,
            newTargetCorpusFiles,
            cancellationToken
        );

        // Update the translation corpus
        corpusUpdated |= await UpdateCorpusConfigAsync(
            project,
            translationEngineId,
            corpusId,
            preTranslate,
            additionalTrainingData: false,
            useAlternateTrainingSource: false,
            uploadParatextZipFile: true,
            corpusUpdated,
            newSourceCorpusFiles,
            newTargetCorpusFiles,
            cancellationToken
        );

        // Get the files we have already synced for the alternate training source
        List<ServalCorpusFile> oldAlternateTrainingSourceCorpusFiles = [];
        List<ServalCorpusFile> newAlternateTrainingSourceCorpusFiles = [];
        if (!string.IsNullOrWhiteSpace(alternateTrainingSourceCorpusId))
        {
            oldAlternateTrainingSourceCorpusFiles = projectSecret
                .ServalData
                .Corpora[alternateTrainingSourceCorpusId]
                .SourceFiles;
        }

        // Upload the training corpus, or remove it if no longer used
        if (useAlternateTrainingSource || useSourceAsAlternateTrainingSource || useAdditionalTrainingSource)
        {
            // Determine which project to use for training
            string paratextId = useAlternateTrainingSource
                ? project.TranslateConfig.DraftConfig.AlternateTrainingSource.ParatextId
                : project.TranslateConfig.Source.ParatextId;
            string projectId = useAlternateTrainingSource
                ? project.TranslateConfig.DraftConfig.AlternateTrainingSource.ProjectRef
                : project.TranslateConfig.Source.ProjectRef;

            // Upload the training corpus
            corpusUpdated |= await UploadNewCorpusFilesAsync(
                targetProjectId: project.Id,
                sourceProjectId: projectId,
                paratextId,
                uploadParatextZipFile: true,
                texts: [],
                oldAlternateTrainingSourceCorpusFiles,
                newAlternateTrainingSourceCorpusFiles,
                cancellationToken
            );

            // Upload the additional training source
            if (useAdditionalTrainingSource)
            {
                corpusUpdated |= await UploadNewCorpusFilesAsync(
                    targetProjectId: project.Id,
                    sourceProjectId: project.TranslateConfig.DraftConfig.AdditionalTrainingSource.ProjectRef,
                    paratextId: project.TranslateConfig.DraftConfig.AdditionalTrainingSource.ParatextId,
                    uploadParatextZipFile: true,
                    texts: [],
                    oldAlternateTrainingSourceCorpusFiles,
                    newAlternateTrainingSourceCorpusFiles,
                    cancellationToken
                );
            }

            // Update the training corpus
            corpusUpdated |= await UpdateCorpusConfigAsync(
                project,
                translationEngineId,
                corpusId: alternateTrainingSourceCorpusId,
                preTranslate: true,
                additionalTrainingData: false,
                useAlternateTrainingSource: true,
                uploadParatextZipFile: true,
                corpusUpdated,
                sourceCorpusFiles: newAlternateTrainingSourceCorpusFiles,
                targetCorpusFiles: newAlternateTrainingSourceCorpusFiles.Count > 0 ? newTargetCorpusFiles : [],
                cancellationToken
            );
        }
        else if (preTranslate && !string.IsNullOrWhiteSpace(alternateTrainingSourceCorpusId))
        {
            // If there is an existing alternate training source, remove it

            // Remove the corpus from Serval
            try
            {
                await translationEnginesClient.DeleteCorpusAsync(
                    translationEngineId,
                    alternateTrainingSourceCorpusId,
                    deleteFiles: true,
                    cancellationToken
                );
            }
            catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
            {
                // If the file was already deleted, just log a message
                string message =
                    $"Corpus {alternateTrainingSourceCorpusId} in project {buildConfig.ProjectId}"
                    + " was missing or already deleted.";
                logger.LogInformation(e, message);
            }

            // Remove the reference to the corpus from the project secret
            await projectSecrets.UpdateAsync(
                project.Id,
                u => u.Unset(p => p.ServalData.Corpora[alternateTrainingSourceCorpusId])
            );
        }

        // See if we have an additional training data
        if (preTranslate)
        {
            // Get the training data corpus id
            string trainingDataCorpusId = projectSecret
                .ServalData.Corpora.FirstOrDefault(c => c.Value.PreTranslate && c.Value.AdditionalTrainingData)
                .Key;

            // If there are training data files, or they were removed (i.e. we have a corpus record for it)
            if (buildConfig.TrainingDataFiles.Count > 0 || !string.IsNullOrWhiteSpace(trainingDataCorpusId))
            {
                // Set up the collections required to upload the corpus data files
                List<ISFText> newTrainingDataSourceTexts = [];
                List<ISFText> newTrainingDataTargetTexts = [];
                List<ServalCorpusFile> newTrainingDataSourceCorpusFiles = [];
                List<ServalCorpusFile> newTrainingDataTargetCorpusFiles = [];
                List<ServalCorpusFile> oldTrainingDataSourceCorpusFiles = [];
                List<ServalCorpusFile> oldTrainingDataTargetCorpusFiles = [];

                // Get the training data texts
                await trainingDataService.GetTextsAsync(
                    curUserId,
                    buildConfig.ProjectId,
                    buildConfig.TrainingDataFiles,
                    newTrainingDataSourceTexts,
                    newTrainingDataTargetTexts
                );

                // Get the training data files we have already synced
                if (!string.IsNullOrWhiteSpace(trainingDataCorpusId))
                {
                    oldTrainingDataSourceCorpusFiles = projectSecret
                        .ServalData
                        .Corpora[trainingDataCorpusId]
                        .SourceFiles;
                    oldTrainingDataTargetCorpusFiles = projectSecret
                        .ServalData
                        .Corpora[trainingDataCorpusId]
                        .TargetFiles;
                }

                // Upload the source files for the training data
                corpusUpdated |= await UploadNewCorpusFilesAsync(
                    targetProjectId: project.Id,
                    sourceProjectId: project.Id,
                    project.ParatextId,
                    uploadParatextZipFile: false,
                    newTrainingDataSourceTexts,
                    oldTrainingDataSourceCorpusFiles,
                    newTrainingDataSourceCorpusFiles,
                    cancellationToken
                );

                // Upload the target files for the training data
                corpusUpdated |= await UploadNewCorpusFilesAsync(
                    targetProjectId: project.Id,
                    sourceProjectId: project.Id,
                    project.ParatextId,
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
            TranslationEngine translationEngine = await translationEnginesClient.GetAsync(
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

    [Mutex]
    public async Task UpdateTranslationSourcesAsync(string curUserId, string sfProjectId)
    {
        // Get the user secret
        if (!(await userSecrets.TryGetAsync(curUserId)).TryResult(out UserSecret userSecret))
        {
            throw new DataNotFoundException("The user secret does not exist.");
        }

        // Load the project from the realtime service
        await using IConnection conn = await realtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // If there is an alternate source, ensure that writing system and RTL is correct
        if (projectDoc.Data.TranslateConfig.DraftConfig.AlternateSource is not null)
        {
            ParatextSettings? alternateSourceSettings = paratextService.GetParatextSettings(
                userSecret,
                projectDoc.Data.TranslateConfig.DraftConfig.AlternateSource.ParatextId
            );
            if (alternateSourceSettings is not null)
            {
                await projectDoc.SubmitJson0OpAsync(op =>
                {
                    op.Set(
                        pd => pd.TranslateConfig.DraftConfig.AlternateSource.IsRightToLeft,
                        alternateSourceSettings.IsRightToLeft
                    );
                    if (alternateSourceSettings.LanguageTag is not null)
                        op.Set(
                            pd => pd.TranslateConfig.DraftConfig.AlternateSource.WritingSystem.Tag,
                            alternateSourceSettings.LanguageTag
                        );
                });
            }
        }

        // If there is an alternate training source, ensure that writing system and RTL is correct
        if (projectDoc.Data.TranslateConfig.DraftConfig.AlternateTrainingSource is not null)
        {
            ParatextSettings? alternateSourceSettings = paratextService.GetParatextSettings(
                userSecret,
                projectDoc.Data.TranslateConfig.DraftConfig.AlternateTrainingSource.ParatextId
            );
            if (alternateSourceSettings is not null)
            {
                await projectDoc.SubmitJson0OpAsync(op =>
                {
                    op.Set(
                        pd => pd.TranslateConfig.DraftConfig.AlternateTrainingSource.IsRightToLeft,
                        alternateSourceSettings.IsRightToLeft
                    );
                    if (alternateSourceSettings.LanguageTag is not null)
                        op.Set(
                            pd => pd.TranslateConfig.DraftConfig.AlternateTrainingSource.WritingSystem.Tag,
                            alternateSourceSettings.LanguageTag
                        );
                });
            }
        }

        // If there is an additional training source, ensure that writing system and RTL is correct
        if (projectDoc.Data.TranslateConfig.DraftConfig.AdditionalTrainingSource is not null)
        {
            ParatextSettings? additionalTrainingSourceSettings = paratextService.GetParatextSettings(
                userSecret,
                projectDoc.Data.TranslateConfig.DraftConfig.AdditionalTrainingSource.ParatextId
            );
            if (additionalTrainingSourceSettings is not null)
            {
                await projectDoc.SubmitJson0OpAsync(op =>
                {
                    op.Set(
                        pd => pd.TranslateConfig.DraftConfig.AdditionalTrainingSource.IsRightToLeft,
                        additionalTrainingSourceSettings.IsRightToLeft
                    );
                    if (additionalTrainingSourceSettings.LanguageTag is not null)
                        op.Set(
                            pd => pd.TranslateConfig.DraftConfig.AdditionalTrainingSource.WritingSystem.Tag,
                            additionalTrainingSourceSettings.LanguageTag
                        );
                });
            }
        }
    }

    /// <summary>
    /// Gets the source language for the project.
    /// </summary>
    /// <param name="project">The project.</param>
    /// <param name="useAlternateTrainingSource">If <c>true</c>, use the alternate training source.</param>
    /// <returns>The source language.</returns>
    /// <exception cref="ArgumentNullException"></exception>
    private static string GetSourceLanguage(SFProject? project, bool useAlternateTrainingSource)
    {
        // This error can occur if the project is deleted while the build is running
        if (project is null)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // This error can occur if the project source is cleared while the build is running
        if (project.TranslateConfig.Source is null)
        {
            throw new DataNotFoundException("The project source is not specified.");
        }

        if (useAlternateTrainingSource)
        {
            return project.TranslateConfig.DraftConfig.AlternateTrainingSource?.WritingSystem.Tag
                ?? project.TranslateConfig.Source?.WritingSystem.Tag
                ?? project.TranslateConfig.DraftConfig.AlternateSource?.WritingSystem.Tag
                ?? throw new ArgumentNullException(nameof(project));
        }

        string alternateSourceLanguage = project.TranslateConfig.DraftConfig.AlternateSource?.WritingSystem.Tag;
        bool useAlternateSourceLanguage =
            project.TranslateConfig.DraftConfig.AlternateSourceEnabled
            && !string.IsNullOrWhiteSpace(alternateSourceLanguage);
        return useAlternateSourceLanguage
            ? alternateSourceLanguage
            : project.TranslateConfig.Source?.WritingSystem.Tag ?? throw new ArgumentNullException(nameof(project));
    }

    /// <summary>
    /// Gets the segments from the text with Unix/Linux line endings.
    /// </summary>
    /// <param name="text">The <see cref="ISFText"/>.</param>
    /// <returns>The text file data to be uploaded to Serval.</returns>
    private static string GetTextFileData(ISFText text)
    {
        var sb = new StringBuilder();

        // For pre-translation, we must upload empty lines with segment refs for the correct references to be returned
        foreach (SFTextSegment segment in text.Segments.Where(s => !s.IsEmpty))
        {
            sb.Append(segment.SegmentRef);
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
        JObject? servalConfig = null;
        if (draftConfig.ServalConfig is not null)
        {
            // Load the Serval Config from the Draft Config
            servalConfig = JObject.Parse(draftConfig.ServalConfig);
        }
        else if (await featureManager.IsEnabledAsync(FeatureFlags.UpdatedLearningRateForServal))
        {
            // Specify the updated learning rate
            servalConfig = JObject.Parse(
                """
                {
                    "train_params":
                    {
                        "warmup_steps": 1000,
                        "learning_rate": 0.0002,
                        "lr_scheduler_type": "cosine",
                        "max_steps": 5000
                    }
                }
                """
            );
        }

        // If Fast Training is enabled, override the max_steps
        if (buildConfig.FastTraining)
        {
            // Ensure that there is a servalConfig JSON object
            servalConfig ??= [];

            // 20 is the number of steps used on Serval QA by default
            servalConfig["max_steps"] = 20;
        }

        // See if there is an alternate training source or alternate drafting source corpus
        bool useAlternateTrainingCorpus =
            (draftConfig.AlternateTrainingSourceEnabled && draftConfig.AlternateTrainingSource is not null)
            || draftConfig.AlternateSourceEnabled && draftConfig.AlternateSource is not null;

        // Set up the pre-translation and training corpora
        List<PretranslateCorpusConfig> preTranslate = [];
        List<TrainingCorpusConfig>? trainOn = null;

        // Add the pre-translation books
        foreach (
            KeyValuePair<string, ServalCorpus> corpus in servalData.Corpora.Where(s =>
                s.Value.PreTranslate && !s.Value.AlternateTrainingSource && !s.Value.AdditionalTrainingData
            )
        )
        {
            var preTranslateCorpusConfig = new PretranslateCorpusConfig { CorpusId = corpus.Key };

            // If this is a Paratext zip file corpus
            if (corpus.Value.UploadParatextZipFile)
            {
                // Since all books are uploaded via the zip file, we need to specify the target books to translate
                preTranslateCorpusConfig.ScriptureRange = !string.IsNullOrWhiteSpace(
                    buildConfig.TranslationScriptureRange
                )
                    ? buildConfig.TranslationScriptureRange
                    : string.Join(';', buildConfig.TranslationBooks.Select(Canon.BookNumberToId));

                // Ensure that the pre-translate scripture range is null if it is blank
                if (string.IsNullOrWhiteSpace(preTranslateCorpusConfig.ScriptureRange))
                {
                    preTranslateCorpusConfig.ScriptureRange = null;
                }

                if (!useAlternateTrainingCorpus)
                {
                    string? scriptureRange = !string.IsNullOrWhiteSpace(buildConfig.TrainingScriptureRange)
                        ? buildConfig.TrainingScriptureRange
                        : string.Join(';', buildConfig.TrainingBooks.Select(Canon.BookNumberToId));
                    string[]? textIds = null;

                    // Ensure that the trainOn scripture range is null if it is blank,
                    // and that the textIds array is empty so no books are trained on.
                    if (string.IsNullOrWhiteSpace(scriptureRange))
                    {
                        scriptureRange = null;
                        textIds = [];
                    }

                    // As we do not have an alternate train on source specified, use the source texts to train on
                    trainOn ??= [];
                    trainOn.Add(
                        new TrainingCorpusConfig
                        {
                            CorpusId = corpus.Key,
                            ScriptureRange = scriptureRange,
                            TextIds = textIds
                        }
                    );
                }
            }

            preTranslate.Add(preTranslateCorpusConfig);
        }

        // Add the alternate training corpus, if enabled
        // This will be the reference source if we are using an alternate drafting source
        if (useAlternateTrainingCorpus)
        {
            trainOn = [];
            foreach (
                KeyValuePair<string, ServalCorpus> corpus in servalData.Corpora.Where(s =>
                    s.Value.PreTranslate && s.Value.AlternateTrainingSource
                )
            )
            {
                var trainingCorpusConfig = new TrainingCorpusConfig { CorpusId = corpus.Key };
                if (corpus.Value.UploadParatextZipFile)
                {
                    // As all books are uploaded via the zip file, specify the source books to train on
                    trainingCorpusConfig.ScriptureRange = !string.IsNullOrWhiteSpace(buildConfig.TrainingScriptureRange)
                        ? buildConfig.TrainingScriptureRange
                        : string.Join(';', buildConfig.TrainingBooks.Select(Canon.BookNumberToId));

                    // Ensure that the alternate training corpus scripture range is null if it is blank,
                    // and that the textIds array is empty so no books are trained on.
                    if (string.IsNullOrWhiteSpace(trainingCorpusConfig.ScriptureRange))
                    {
                        trainingCorpusConfig.ScriptureRange = null;
                        trainingCorpusConfig.TextIds = [];
                    }
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

        // If we have an alternate training source, we need to add the additional files
        // If not, Serval will use the additional files corpus automatically, so we do not need to do anything
        if (buildConfig.TrainingDataFiles.Count > 0 && useAlternateTrainingCorpus)
        {
            // Include the additional training data with the alternate training corpora
            translationBuildConfig.TrainOn.AddRange(
                servalData
                    .Corpora.Where(s => s.Value.PreTranslate && s.Value.AdditionalTrainingData)
                    .Select(c => new TrainingCorpusConfig { CorpusId = c.Key })
                    .ToList()
            );
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
        SFProjectSecret projectSecret = await projectSecrets.GetAsync(sfProject.Id);
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
            TranslationEngine translationEngine = await translationEnginesClient.CreateAsync(
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
                await projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData.PreTranslationEngineId, translationEngine.Id)
                );
            }
            else if (projectSecret.ServalData is not null)
            {
                // Store the Translation Engine ID
                await projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData.TranslationEngineId, translationEngine.Id)
                );
            }
            else if (preTranslate)
            {
                // Store the Pre-Translation Engine ID
                await projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData, new ServalData { PreTranslationEngineId = translationEngine.Id })
                );
            }
            else
            {
                // Store the Translation Engine ID
                await projectSecrets.UpdateAsync(
                    sfProject.Id,
                    u => u.Set(p => p.ServalData, new ServalData { TranslationEngineId = translationEngine.Id })
                );
            }
        }

        return translationEngineId;
    }

    private async Task<bool> UploadFileAsync(
        string textId,
        string projectId,
        string textFileData,
        FileFormat fileFormat,
        ICollection<ServalCorpusFile>? oldCorpusFiles,
        ICollection<ServalCorpusFile> newCorpusFiles,
        CancellationToken cancellationToken
    )
    {
        byte[] buffer = Encoding.UTF8.GetBytes(textFileData);
        await using Stream stream = new MemoryStream(buffer, false);
        return await UploadFileAsync(
            textId,
            projectId,
            stream,
            fileFormat,
            oldCorpusFiles,
            newCorpusFiles,
            cancellationToken
        );
    }

    private async Task<bool> UploadFileAsync(
        string textId,
        string projectId,
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
        ServalCorpusFile? previousCorpusFile = oldCorpusFiles?.FirstOrDefault(c =>
            c.TextId == textId && c.ProjectId == projectId
        );
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
            dataFile = await dataFilesClient.CreateAsync(
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
                dataFile = await dataFilesClient.GetAsync(previousCorpusFile.FileId, cancellationToken);
                dataFileExists = dataFile.Format == fileFormat;
            }
            catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
            {
                logger.LogInformation($"File {previousCorpusFile.FileId} does not exist - creating.");
                dataFileExists = false;
            }

            // Update the file if it exists, otherwise create it
            dataFile = dataFileExists
                ? await dataFilesClient.UpdateAsync(
                    previousCorpusFile.FileId,
                    new FileParameter(stream),
                    cancellationToken
                )
                : await dataFilesClient.CreateAsync(new FileParameter(stream), fileFormat, textId, cancellationToken);
        }

        newCorpusFiles.Add(
            new ServalCorpusFile
            {
                FileChecksum = checksum,
                FileId = dataFile.Id,
                ProjectId = projectId,
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
        bool useEcho = await featureManager.IsEnabledAsync(FeatureFlags.UseEchoForPreTranslation);
        return useEcho ? GetSourceLanguage(project, useAlternateTrainingSource: false) : project.WritingSystem.Tag;
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
            corpus = await translationEnginesClient.AddCorpusAsync(
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
                corpus = await translationEnginesClient.GetCorpusAsync(
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
                logger.LogInformation($"Corpus {corpusId} in Translation Engine {translationEngineId} does not exist.");
                createCorpus = true;
                deleteCorpus = false;
            }

            // The language has changed, or the corpus is missing
            if (createCorpus)
            {
                // Delete the old corpus
                if (deleteCorpus)
                {
                    await translationEnginesClient.DeleteCorpusAsync(
                        translationEngineId,
                        corpusId,
                        deleteFiles: false,
                        cancellationToken
                    );
                }

                // Recreate the corpus
                corpus = await translationEnginesClient.AddCorpusAsync(
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
                corpus = await translationEnginesClient.UpdateCorpusAsync(
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
        await projectSecrets.UpdateAsync(
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
    /// <param name="targetProjectId">The target project identifier.</param>
    /// <param name="sourceProjectId">The source project identifier (this may be a training source).</param>
    /// <param name="paratextId">The Paratext identifier.</param>
    /// <param name="uploadParatextZipFile">
    /// <c>true</c> if we are uploading a Paratext zip file; otherwise <c>false</c>.
    /// </param>
    /// <param name="texts">The texts created by <see cref="TrainingDataService"/>.</param>
    /// <param name="oldCorpusFiles">The existing corpus files (optional).</param>
    /// <param name="newCorpusFiles">The updated list of corpus files.</param>
    /// <param name="cancellationToken"></param>
    /// <returns><c>true</c> if the corpus was created or updated; otherwise, <c>false</c>.</returns>
    /// <remarks>
    /// The project secret is updated with the corpus file details added to or removed from Serval.
    /// </remarks>
    private async Task<bool> UploadNewCorpusFilesAsync(
        string targetProjectId,
        string sourceProjectId,
        string paratextId,
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
            string path = Path.Combine(siteOptions.Value.SiteDir, "sync", paratextId, "target");

            // Ensure that the path exists
            if (!fileSystemService.DirectoryExists(path))
            {
                throw new DirectoryNotFoundException($"The directory could not be found for {paratextId}");
            }

            // Create the zip file from the directory in memory
            await using var memoryStream = new MemoryStream();
            using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
            {
                // Do not convert the ZipArchive using statement above into a using declaration,
                // otherwise the ZipArchive disposal will crash after the MemoryStream disposal.
                foreach (string filePath in fileSystemService.EnumerateFiles(path))
                {
                    await using Stream fileStream = fileSystemService.OpenFile(filePath, FileMode.Open);
                    ZipArchiveEntry entry = archive.CreateEntry(Path.GetFileName(filePath));
                    await using Stream entryStream = entry.Open();
                    await fileStream.CopyToAsync(entryStream, cancellationToken);
                }
            }

            // Upload the zip file
            corpusUpdated = await UploadFileAsync(
                textId: targetProjectId,
                projectId: sourceProjectId,
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
                string textFileData = GetTextFileData(text);
                if (!string.IsNullOrWhiteSpace(textFileData))
                {
                    // Remove the target project id from the start of the text id (if present)
                    string textId = text.Id.StartsWith($"{targetProjectId}_")
                        ? text.Id[(targetProjectId.Length + 1)..]
                        : text.Id;

                    // Remove the source project id from the start of the text id (if present)
                    textId = textId.StartsWith($"{sourceProjectId}_") ? textId[(sourceProjectId.Length + 1)..] : textId;

                    // Upload the text file
                    corpusUpdated |= await UploadFileAsync(
                        textId,
                        sourceProjectId,
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
                    await dataFilesClient.DeleteAsync(corpusFile.FileId, cancellationToken);
                }
                catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
                {
                    // If the file was already deleted, just log a message
                    string message =
                        $"Corpora file {corpusFile.FileId} for text {corpusFile.TextId} in project {targetProjectId}"
                        + " was missing or already deleted.";
                    logger.LogInformation(e, message);
                }

                corpusUpdated = true;
            }
        }

        return corpusUpdated;
    }
}
