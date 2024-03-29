using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Serval.Client;
using SIL.ObjectModel;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// The Machine API service for use with <see cref="Controllers.MachineApiController"/>.
/// </summary>
public class MachineApiService(
    IBackgroundJobClient backgroundJobClient,
    ILogger<MachineApiService> logger,
    IMachineProjectService machineProjectService,
    IPreTranslationService preTranslationService,
    IRepository<SFProjectSecret> projectSecrets,
    IRealtimeService realtimeService,
    ISyncService syncService,
    ITranslationEnginesClient translationEnginesClient,
    ITranslationEngineTypesClient translationEngineTypesClient
) : IMachineApiService
{
    /// <summary>
    /// The Faulted build state.
    /// </summary>
    /// <remarks>
    /// NOTE: Serval returns states in TitleCase, while the frontend requires uppercase.
    /// </remarks>
    internal const string BuildStateFaulted = "FAULTED";

    /// <summary>
    /// The Queued build state.
    /// </summary>
    /// <remarks>
    /// SF returns this state while the files are being uploaded to Serval.
    /// </remarks>
    internal const string BuildStateQueued = "QUEUED";
    private static readonly IEqualityComparer<IList<int>> _listIntComparer = SequenceEqualityComparer.Create(
        EqualityComparer<int>.Default
    );
    private static readonly IEqualityComparer<IList<string>> _listStringComparer = SequenceEqualityComparer.Create(
        EqualityComparer<string>.Default
    );

    public async Task CancelPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Get the translation engine id
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: true);

        // If we have pre-translation job information
        if (
            (await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret)
            && (
                projectSecret.ServalData?.PreTranslationJobId is not null
                || projectSecret.ServalData?.PreTranslationQueuedAt is not null
            )
        )
        {
            // Cancel the Hangfire job
            if (projectSecret.ServalData?.PreTranslationJobId is not null)
            {
                backgroundJobClient.Delete(projectSecret.ServalData?.PreTranslationJobId);
            }

            // Clear the pre-translation queued status and job id
            await projectSecrets.UpdateAsync(
                sfProjectId,
                u =>
                {
                    u.Unset(p => p.ServalData.PreTranslationJobId);
                    u.Unset(p => p.ServalData.PreTranslationQueuedAt);
                }
            );
        }

        try
        {
            // Cancel the build on Serval
            await translationEnginesClient.CancelBuildAsync(translationEngineId, cancellationToken);
        }
        catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
        {
            // We do not mind if a 404 exception comes from Serval - we can assume the job is now cancelled
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }
    }

    public async Task<ServalBuildDto?> GetBuildAsync(
        string curUserId,
        string sfProjectId,
        string buildId,
        long? minRevision,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate);

        try
        {
            TranslationBuild translationBuild = await translationEnginesClient.GetBuildAsync(
                translationEngineId,
                buildId,
                minRevision,
                cancellationToken
            );
            buildDto = CreateDto(translationBuild);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        if (buildDto is not null)
        {
            UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<ServalBuildDto?> GetLastCompletedPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Get the translation engine
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: true);

        try
        {
            // Get the last completed build
            TranslationBuild? translationBuild = (
                await translationEnginesClient.GetAllBuildsAsync(translationEngineId, cancellationToken)
            )
                .Where(b => b.State == JobState.Completed)
                .MaxBy(b => b.DateFinished);
            if (translationBuild is not null)
            {
                buildDto = CreateDto(translationBuild);
            }
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        if (buildDto is not null)
        {
            UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<ServalBuildDto?> GetCurrentBuildAsync(
        string curUserId,
        string sfProjectId,
        long? minRevision,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Otherwise execute on Serval, if it is enabled
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate);

        try
        {
            TranslationBuild translationBuild;
            try
            {
                translationBuild = await translationEnginesClient.GetCurrentBuildAsync(
                    translationEngineId,
                    minRevision,
                    cancellationToken
                );
            }
            catch (ServalApiException e) when (preTranslate && e.StatusCode == StatusCodes.Status204NoContent)
            {
                // This is the expected result if there is no current build.
                // If there is no pre-translation build, just get the latest one.
                translationBuild =
                    (await translationEnginesClient.GetAllBuildsAsync(translationEngineId, cancellationToken)).MaxBy(
                        b => b.DateFinished
                    ) ?? throw new DataNotFoundException("Entity Deleted");
            }

            buildDto = CreateDto(translationBuild);
            UpdateDto(buildDto, sfProjectId);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        return buildDto;
    }

    public async Task<ServalEngineDto> GetEngineAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);

        try
        {
            TranslationEngine translationEngine = await translationEnginesClient.GetAsync(
                translationEngineId,
                cancellationToken
            );
            ServalEngineDto engineDto = CreateDto(translationEngine);

            // Make sure the DTO conforms to the machine-api V2 URLs
            return UpdateDto(engineDto, sfProjectId);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<PreTranslationDto> GetPreTranslationAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    )
    {
        // Create the DTO to return
        PreTranslationDto preTranslation = new PreTranslationDto();

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        try
        {
            preTranslation.PreTranslations = await preTranslationService.GetPreTranslationsAsync(
                curUserId,
                sfProjectId,
                bookNum,
                chapterNum,
                cancellationToken
            );
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }

        return preTranslation;
    }

    public async Task<ServalBuildDto?> GetPreTranslationQueuedStateAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // If there is a pre-translation queued, return a build dto with a status showing it is queued
        if ((await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            // If we have an error message, report that to the user
            if (!string.IsNullOrWhiteSpace(projectSecret.ServalData?.PreTranslationErrorMessage))
            {
                return new ServalBuildDto
                {
                    State = BuildStateFaulted,
                    Message = projectSecret.ServalData.PreTranslationErrorMessage,
                    AdditionalInfo = new ServalBuildAdditionalInfo
                    {
                        TranslationEngineId = projectSecret.ServalData.PreTranslationEngineId ?? string.Empty,
                    },
                };
            }

            // If we do not have build queued, do not return a build dto
            if (projectSecret.ServalData?.PreTranslationQueuedAt is null)
            {
                return null;
            }

            // If the build was queued 6 hours or more ago, it will have failed to upload
            if (projectSecret.ServalData?.PreTranslationQueuedAt <= DateTime.UtcNow.AddHours(-6))
            {
                return new ServalBuildDto
                {
                    State = BuildStateFaulted,
                    Message = "The build failed to upload to the server.",
                    AdditionalInfo = new ServalBuildAdditionalInfo
                    {
                        TranslationEngineId = projectSecret.ServalData.PreTranslationEngineId ?? string.Empty,
                    },
                };
            }

            // The build is queued and uploading is occurring in the background
            return new ServalBuildDto
            {
                State = BuildStateQueued,
                Message = "The build is being uploaded to the server.",
                AdditionalInfo = new ServalBuildAdditionalInfo
                {
                    TranslationEngineId = projectSecret.ServalData?.PreTranslationEngineId ?? string.Empty,
                },
            };
        }

        return null;
    }

    public async Task<WordGraph> GetWordGraphAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
        try
        {
            return await translationEnginesClient.GetWordGraphAsync(translationEngineId, segment, cancellationToken);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<LanguageDto> IsLanguageSupportedAsync(string languageCode, CancellationToken cancellationToken)
    {
        string engineType = await machineProjectService.GetTranslationEngineTypeAsync(preTranslate: true);
        LanguageInfo languageInfo = await translationEngineTypesClient.GetLanguageInfoAsync(
            engineType,
            languageCode,
            cancellationToken
        );
        return new LanguageDto
        {
            LanguageCode = languageInfo.InternalCode ?? languageCode,
            IsSupported = languageInfo.IsNative,
        };
    }

    public async Task<ServalBuildDto> StartBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        ServalBuildDto? buildDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string? translationEngineId = await GetTranslationIdAsync(
            sfProjectId,
            preTranslate: false,
            returnEmptyStringIfMissing: true
        );
        try
        {
            // If the translation engine is missing or does not exist, recreate it
            if (
                !await machineProjectService.TranslationEngineExistsAsync(
                    sfProjectId,
                    translationEngineId,
                    preTranslate: false,
                    cancellationToken
                )
            )
            {
                // Clear the existing translation engine id and corpora
                // AddProjectAsync() requires the id to be not defined to create the new translation engine.
                // We also load the project secret, so we can get the corpora ID to delete
                if (
                    !string.IsNullOrWhiteSpace(translationEngineId)
                    && (await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret)
                )
                {
                    string? corporaId = projectSecret
                        .ServalData?.Corpora
                        .FirstOrDefault(c => !c.Value.PreTranslate)
                        .Key;
                    await projectSecrets.UpdateAsync(
                        sfProjectId,
                        u =>
                        {
                            u.Unset(p => p.ServalData.TranslationEngineId);
                            if (!string.IsNullOrWhiteSpace(corporaId))
                            {
                                u.Unset(p => p.ServalData.Corpora[corporaId]);
                            }
                        }
                    );
                }

                translationEngineId = await machineProjectService.AddProjectAsync(
                    curUserId,
                    sfProjectId,
                    preTranslate: false,
                    cancellationToken
                );
            }
            else
            {
                // Ensure that the source and target language have not changed
                bool recreateTranslationEngine = false;

                // Load the project from the realtime service
                await using IConnection conn = await realtimeService.ConnectAsync(curUserId);
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(sfProjectId);
                if (!projectDoc.IsLoaded)
                {
                    throw new DataNotFoundException("The project does not exist.");
                }

                // Get the translation engine
                TranslationEngine translationEngine = await translationEnginesClient.GetAsync(
                    translationEngineId,
                    cancellationToken
                );

                // See if the target language has changed
                string projectTargetLanguage = projectDoc.Data.WritingSystem.Tag;
                if (translationEngine.TargetLanguage != projectTargetLanguage)
                {
                    string message =
                        $"Target language has changed from {translationEngine.TargetLanguage} to {projectTargetLanguage}.";
                    logger.LogInformation(message);
                    recreateTranslationEngine = true;
                }

                // See if the source language has changed
                string projectSourceLanguage = projectDoc.Data.TranslateConfig.Source?.WritingSystem.Tag;
                if (translationEngine.SourceLanguage != projectSourceLanguage)
                {
                    string message =
                        $"Target language has changed from {translationEngine.TargetLanguage} to {projectTargetLanguage}.";
                    logger.LogInformation(message);
                    recreateTranslationEngine = true;
                }

                // Delete then recreate the translation engine if they have changed
                if (recreateTranslationEngine)
                {
                    // Removal can be a slow process
                    await machineProjectService.RemoveProjectAsync(
                        curUserId,
                        sfProjectId,
                        preTranslate: false,
                        cancellationToken
                    );
                    translationEngineId = await machineProjectService.AddProjectAsync(
                        curUserId,
                        sfProjectId,
                        preTranslate: false,
                        cancellationToken
                    );
                }
            }
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);

            // Ensure that the translation engine id is null so a Serval build isn't started
            translationEngineId = null;
        }

        if (!string.IsNullOrWhiteSpace(translationEngineId))
        {
            try
            {
                // We do not need the success boolean result, as we will still rebuild if no files have changed
                await machineProjectService.SyncProjectCorporaAsync(
                    curUserId,
                    new BuildConfig { ProjectId = sfProjectId },
                    preTranslate: false,
                    cancellationToken
                );
                TranslationBuild translationBuild = await translationEnginesClient.StartBuildAsync(
                    translationEngineId,
                    new TranslationBuildConfig(),
                    cancellationToken
                );
                buildDto = CreateDto(translationBuild);
            }
            catch (ServalApiException e)
            {
                ProcessServalApiException(e);
            }
        }

        // This will be null if Serval is down
        if (buildDto is null)
        {
            throw new DataNotFoundException("No translation engine could be retrieved - Is Serval Down?");
        }

        return UpdateDto(buildDto, sfProjectId);
    }

    public async Task StartPreTranslationBuildAsync(
        string curUserId,
        BuildConfig buildConfig,
        CancellationToken cancellationToken
    )
    {
        // Load the project from the realtime service
        await using IConnection conn = await realtimeService.ConnectAsync(curUserId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(buildConfig.ProjectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure that the user has permission on the project
        MachineApi.EnsureProjectPermission(curUserId, projectDoc.Data);

        // Save the selected books
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTrainingBooks,
                buildConfig.TrainingBooks.ToList(),
                _listIntComparer
            );
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTrainingDataFiles,
                buildConfig.TrainingDataFiles.ToList(),
                _listStringComparer
            );
            op.Set(
                p => p.TranslateConfig.DraftConfig.LastSelectedTranslationBooks,
                buildConfig.TranslationBooks.ToList(),
                _listIntComparer
            );
        });

        // Sync the source and target before running the build
        string jobId = await syncService.SyncAsync(
            new SyncConfig { ProjectId = buildConfig.ProjectId, UserId = curUserId }
        );

        // If we have an alternate source, sync that first
        string alternateSourceProjectId = projectDoc.Data.TranslateConfig.DraftConfig.AlternateSource?.ProjectRef;
        if (!string.IsNullOrWhiteSpace(alternateSourceProjectId))
        {
            jobId = await syncService.SyncAsync(
                new SyncConfig
                {
                    ParentJobId = jobId,
                    ProjectId = alternateSourceProjectId,
                    TargetOnly = true,
                    UserId = curUserId,
                }
            );
        }

        // If we have an alternate training source, sync that next
        string alternateTrainingSourceProjectId = projectDoc
            .Data
            .TranslateConfig
            .DraftConfig
            .AlternateTrainingSource
            ?.ProjectRef;
        if (
            projectDoc.Data.TranslateConfig.DraftConfig.AlternateTrainingSourceEnabled
            && !string.IsNullOrWhiteSpace(alternateTrainingSourceProjectId)
        )
        {
            jobId = await syncService.SyncAsync(
                new SyncConfig
                {
                    ParentJobId = jobId,
                    ProjectId = alternateTrainingSourceProjectId,
                    TargetOnly = true,
                    UserId = curUserId,
                }
            );
        }

        // Run the training after the sync has completed
        jobId = backgroundJobClient.ContinueJobWith<MachineProjectService>(
            jobId,
            r => r.BuildProjectForBackgroundJobAsync(curUserId, buildConfig, true, CancellationToken.None)
        );

        // Set the pre-translation queued date and time, and hang fire job id
        await projectSecrets.UpdateAsync(
            buildConfig.ProjectId,
            u =>
            {
                u.Set(p => p.ServalData.PreTranslationJobId, jobId);
                u.Set(p => p.ServalData.PreTranslationQueuedAt, DateTime.UtcNow);
                u.Unset(p => p.ServalData.PreTranslationErrorMessage);
            }
        );
    }

    public async Task TrainSegmentAsync(
        string curUserId,
        string sfProjectId,
        SegmentPair segmentPair,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
        try
        {
            await translationEnginesClient.TrainSegmentAsync(translationEngineId, segmentPair, cancellationToken);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
        }
    }

    public async Task<TranslationResult> TranslateAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
        try
        {
            return await translationEnginesClient.TranslateAsync(translationEngineId, segment, cancellationToken);
        }
        catch (ServalApiException e)
        {
            ProcessServalApiException(e);
            throw;
        }
    }

    public async Task<TranslationResult[]> TranslateNAsync(
        string curUserId,
        string sfProjectId,
        int n,
        string segment,
        CancellationToken cancellationToken
    )
    {
        IEnumerable<TranslationResult> translationResults = Array.Empty<TranslationResult>();

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
        if (!string.IsNullOrWhiteSpace(translationEngineId))
        {
            try
            {
                translationResults = await translationEnginesClient.TranslateNAsync(
                    translationEngineId,
                    n,
                    segment,
                    cancellationToken
                );
            }
            catch (ServalApiException e)
            {
                ProcessServalApiException(e);
            }
        }

        return [.. translationResults];
    }

    /// <summary>
    /// Creates the Build DTO for the front end.
    /// </summary>
    /// <param name="translationBuild">The translation build from Serval.</param>
    /// <returns>The build DTO.</returns>
    private static ServalBuildDto CreateDto(TranslationBuild translationBuild) =>
        new ServalBuildDto
        {
            Id = translationBuild.Id,
            Revision = translationBuild.Revision,
            PercentCompleted = translationBuild.PercentCompleted ?? 0.0,
            Message = translationBuild.Message,
            QueueDepth = translationBuild.QueueDepth ?? 0,
            State = translationBuild.State.ToString().ToUpperInvariant(),
            AdditionalInfo = new ServalBuildAdditionalInfo
            {
                BuildId = translationBuild.Id,
                CorporaIds = translationBuild.Pretranslate?.Select(p => p.Corpus.Id),
                DateFinished = translationBuild.DateFinished,
                Step = translationBuild.Step,
                TranslationEngineId = translationBuild.Engine.Id,
            },
        };

    private static ServalEngineDto CreateDto(TranslationEngine translationEngine) =>
        new ServalEngineDto
        {
            Id = translationEngine.Id,
            Confidence = translationEngine.Confidence / 100.0,
            TrainedSegmentCount = translationEngine.CorpusSize,
            SourceLanguageTag = translationEngine.SourceLanguage,
            TargetLanguageTag = translationEngine.TargetLanguage,
        };

    /// <summary>
    /// This method maps Serval API exceptions to the exceptions that Machine.js understands.
    /// </summary>
    /// <param name="e">The Serval API Exception</param>>
    /// <exception cref="DataNotFoundException">Entity Deleted.</exception>
    /// <exception cref="ForbiddenException">Access Denied.</exception>
    /// <exception cref="NotSupportedException">Method not allowed.</exception>
    /// <remarks>If this method returns, it is expected that the DTO will be null.</remarks>
    private static void ProcessServalApiException(ServalApiException e)
    {
        switch (e)
        {
            case { StatusCode: StatusCodes.Status204NoContent }:
                throw new DataNotFoundException("Entity Deleted");
            case { StatusCode: StatusCodes.Status403Forbidden }:
                throw new ForbiddenException();
            case { StatusCode: StatusCodes.Status404NotFound }:
                throw new DataNotFoundException("Entity Deleted");
            case { StatusCode: StatusCodes.Status405MethodNotAllowed }:
                throw new NotSupportedException();
            case { StatusCode: StatusCodes.Status408RequestTimeout }:
                return;
            case { StatusCode: StatusCodes.Status409Conflict }:
                throw new InvalidOperationException();
            default:
                throw e;
        }
    }

    private static ServalBuildDto UpdateDto(ServalBuildDto buildDto, string sfProjectId)
    {
        buildDto.Href = MachineApi.GetBuildHref(sfProjectId, buildDto.Id);
        buildDto.Engine = new ServalResourceDto { Id = sfProjectId, Href = MachineApi.GetEngineHref(sfProjectId) };

        // We use this special ID format so that the DTO ID can be an optional URL parameter
        buildDto.Id = $"{sfProjectId}.{buildDto.Id}";
        return buildDto;
    }

    private static ServalEngineDto UpdateDto(ServalEngineDto engineDto, string sfProjectId)
    {
        engineDto.Href = MachineApi.GetEngineHref(sfProjectId);
        engineDto.Id = sfProjectId;
        engineDto.Projects = [new ServalResourceDto { Href = MachineApi.GetEngineHref(sfProjectId), Id = sfProjectId }];
        return engineDto;
    }

    private async Task EnsureProjectPermissionAsync(string curUserId, string sfProjectId)
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Check for permission
        MachineApi.EnsureProjectPermission(curUserId, project);
    }

    private async Task<string> GetTranslationIdAsync(
        string sfProjectId,
        bool preTranslate,
        bool returnEmptyStringIfMissing = false
    )
    {
        // Load the project secret, so we can get the translation engine ID
        if (!(await projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            return returnEmptyStringIfMissing
                ? string.Empty
                : throw new DataNotFoundException("The project secret is missing");
        }

        // Ensure we have a translation engine ID
        string? translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            return returnEmptyStringIfMissing
                ? string.Empty
                : throw new DataNotFoundException("The translation engine is not configured");
        }

        return translationEngineId;
    }
}
