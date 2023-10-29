using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Machine.Threading;
using SIL.Machine.Tokenization;
using SIL.Machine.Translation;
using SIL.Machine.WebApi;
using SIL.Machine.WebApi.Configuration;
using SIL.Machine.WebApi.DataAccess;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using MachinePhrase = SIL.Machine.Translation.Phrase;
using MachineTranslationResult = SIL.Machine.Translation.TranslationResult;
using MachineWordGraph = SIL.Machine.Translation.WordGraph;
using MachineWordGraphArc = SIL.Machine.Translation.WordGraphArc;
// Until the In-Process Machine distinguishes its objects from Serval
using Phrase = Serval.Client.Phrase;
using TranslationResult = Serval.Client.TranslationResult;
using WordGraph = Serval.Client.WordGraph;
using WordGraphArc = Serval.Client.WordGraphArc;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// The Machine API service for use with <see cref="Controllers.MachineApiController"/>.
/// </summary>
public class MachineApiService : IMachineApiService
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
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly IBuildRepository _builds;
    private readonly IEngineRepository _engines;
    private readonly IOptions<EngineOptions> _engineOptions;
    private readonly IEngineService _engineService;
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IFeatureManager _featureManager;
    private readonly IMachineProjectService _machineProjectService;
    private readonly IPreTranslationService _preTranslationService;
    private readonly DataAccess.IRepository<SFProjectSecret> _projectSecrets;
    private readonly IRealtimeService _realtimeService;
    private readonly ISyncService _syncService;
    private readonly ITranslationEnginesClient _translationEnginesClient;
    private readonly StringTokenizer _wordTokenizer = new LatinWordTokenizer();

    public MachineApiService(
        IBackgroundJobClient backgroundJobClient,
        IBuildRepository builds,
        IEngineRepository engines,
        IOptions<EngineOptions> engineOptions,
        IEngineService engineService,
        IExceptionHandler exceptionHandler,
        IFeatureManager featureManager,
        IMachineProjectService machineProjectService,
        IPreTranslationService preTranslationService,
        DataAccess.IRepository<SFProjectSecret> projectSecrets,
        IRealtimeService realtimeService,
        ISyncService syncService,
        ITranslationEnginesClient translationEnginesClient
    )
    {
        // In Process Machine Dependencies
        _builds = builds;
        _engines = engines;
        _engineOptions = engineOptions;
        _engineService = engineService;

        // Shared Dependencies
        _exceptionHandler = exceptionHandler;
        _featureManager = featureManager;

        // Serval Dependencies
        _backgroundJobClient = backgroundJobClient;
        _machineProjectService = machineProjectService;
        _preTranslationService = preTranslationService;
        _projectSecrets = projectSecrets;
        _realtimeService = realtimeService;
        _syncService = syncService;
        _translationEnginesClient = translationEnginesClient;
    }

    public async Task CancelPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // We only support Serval for canceling the current build
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            throw new DataNotFoundException("The translation engine does not support pre-translations");
        }

        // Get the translation engine id
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: true);
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            throw new DataNotFoundException("The translation engine is not configured");
        }

        // If we have pre-translation job information
        if (
            (await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret)
            && (
                projectSecret.ServalData?.PreTranslationJobId is not null
                || projectSecret.ServalData?.PreTranslationQueuedAt is not null
            )
        )
        {
            // Cancel the Hangfire job
            if (projectSecret.ServalData?.PreTranslationJobId is not null)
            {
                _backgroundJobClient.Delete(projectSecret.ServalData?.PreTranslationJobId);
            }

            // Clear the pre-translation queued status and job id
            await _projectSecrets.UpdateAsync(
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
            await _translationEnginesClient.CancelBuildAsync(translationEngineId, cancellationToken);
        }
        catch (ServalApiException e) when (e.StatusCode == StatusCodes.Status404NotFound)
        {
            // We do not mind if a 404 exception comes from Serval - we can assume the job is now cancelled
        }
        catch (Exception e)
        {
            await ProcessServalApiExceptionAsync(e);
        }
    }

    public async Task<BuildDto?> GetBuildAsync(
        string curUserId,
        string sfProjectId,
        string buildId,
        long? minRevision,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        BuildDto? buildDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Execute the In Process Machine instance, if it is enabled and this is not a pre-translation build
        // We can only use In Process or the API - not both or unnecessary delays will result
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess) && !preTranslate)
        {
            buildDto = await GetInProcessBuildAsync(BuildLocatorType.Id, buildId, minRevision, cancellationToken);
        }
        else if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            // Execute on Serval, if it is enabled
            string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate);
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                throw new DataNotFoundException("The translation engine is not configured");
            }

            try
            {
                TranslationBuild translationBuild = await _translationEnginesClient.GetBuildAsync(
                    translationEngineId,
                    buildId,
                    minRevision,
                    cancellationToken
                );
                buildDto = CreateDto(translationBuild);
            }
            catch (Exception e)
            {
                await ProcessServalApiExceptionAsync(e);
            }
        }
        else
        {
            // No feature flags enabled, notify the user
            throw new DataNotFoundException("No Machine learning engine is enabled");
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        if (buildDto is not null)
        {
            UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<BuildDto?> GetLastCompletedPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        BuildDto? buildDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // We only support Serval for this feature
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            throw new DataNotFoundException("The translation engine does not support this feature");
        }

        // Get the translation engine
        string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: true);
        if (string.IsNullOrWhiteSpace(translationEngineId))
        {
            throw new DataNotFoundException("The translation engine is not configured");
        }

        try
        {
            // Get the last completed build
            TranslationBuild? translationBuild = (
                await _translationEnginesClient.GetAllBuildsAsync(translationEngineId, cancellationToken)
            )
                .Where(b => b.State == JobState.Completed)
                .MaxBy(b => b.DateFinished);
            if (translationBuild is not null)
            {
                buildDto = CreateDto(translationBuild);
            }
        }
        catch (Exception e)
        {
            await ProcessServalApiExceptionAsync(e);
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        if (buildDto is not null)
        {
            UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<BuildDto?> GetCurrentBuildAsync(
        string curUserId,
        string sfProjectId,
        long? minRevision,
        bool preTranslate,
        CancellationToken cancellationToken
    )
    {
        BuildDto? buildDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // We can only use In Process or the API - not both or unnecessary delays will result
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess) && !preTranslate)
        {
            // Execute the In Process Machine instance, if it is enabled and this is not a pre-translation build
            Engine engine = await GetInProcessEngineAsync(sfProjectId, cancellationToken);
            buildDto = await GetInProcessBuildAsync(BuildLocatorType.Engine, engine.Id, minRevision, cancellationToken);
        }
        else if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            // Otherwise execute on Serval, if it is enabled
            string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate);
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                throw new DataNotFoundException("The translation engine is not configured");
            }

            try
            {
                TranslationBuild translationBuild;
                try
                {
                    translationBuild = await _translationEnginesClient.GetCurrentBuildAsync(
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
                        (
                            await _translationEnginesClient.GetAllBuildsAsync(translationEngineId, cancellationToken)
                        ).MaxBy(b => b.DateFinished) ?? throw new DataNotFoundException("Entity Deleted");
                }

                buildDto = CreateDto(translationBuild);
            }
            catch (Exception e)
            {
                await ProcessServalApiExceptionAsync(e);
            }
        }
        else
        {
            // No feature flags enabled, notify the user
            throw new DataNotFoundException("No Machine learning engine is enabled");
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        if (buildDto is not null)
        {
            UpdateDto(buildDto, sfProjectId);
        }

        return buildDto;
    }

    public async Task<EngineDto> GetEngineAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        EngineDto? engineDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    TranslationEngine translationEngine = await _translationEnginesClient.GetAsync(
                        translationEngineId,
                        cancellationToken
                    );
                    engineDto = CreateDto(translationEngine);
                }
                catch (Exception e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    await ProcessServalApiExceptionAsync(e, doNotThrowIfInProcessEnabled: true);
                }
            }
            else if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
            {
                // Only throw the exception if the In Process instance will not be called below
                throw new DataNotFoundException("The translation engine is not configured");
            }
        }

        // Execute the In Process Machine instance, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            Engine engine = await GetInProcessEngineAsync(sfProjectId, cancellationToken);
            engineDto = CreateDto(engine);
        }

        // This will be null if Serval is down, or if all feature flags are false
        if (engineDto is null)
        {
            string additionalInfo = await GetAdditionalErrorInformationAsync();
            throw new DataNotFoundException($"No translation engine could be retrieved - {additionalInfo}");
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        return UpdateDto(engineDto, sfProjectId);
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

        // We only support Serval for pre-translations
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            throw new DataNotFoundException("The translation engine does not support pre-translations");
        }

        try
        {
            preTranslation.PreTranslations = await _preTranslationService.GetPreTranslationsAsync(
                curUserId,
                sfProjectId,
                bookNum,
                chapterNum,
                cancellationToken
            );
        }
        catch (Exception e)
        {
            await ProcessServalApiExceptionAsync(e);
        }

        return preTranslation;
    }

    public async Task<BuildDto?> GetPreTranslationQueuedStateAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // If there is a pre-translation queued, return a build dto with a status showing it is queued
        if ((await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            // If we have an error message, report that to the user
            if (!string.IsNullOrWhiteSpace(projectSecret.ServalData?.PreTranslationErrorMessage))
            {
                return new BuildDto
                {
                    State = BuildStateFaulted,
                    Message = projectSecret.ServalData.PreTranslationErrorMessage,
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
                return new BuildDto
                {
                    State = BuildStateFaulted,
                    Message = "The build failed to upload to the server.",
                };
            }

            // The build is queued and uploading is occurring in the background
            return new BuildDto { State = BuildStateQueued, Message = "The build is being uploaded to the server." };
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
        WordGraph? wordGraph = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    wordGraph = await _translationEnginesClient.GetWordGraphAsync(
                        translationEngineId,
                        segment,
                        cancellationToken
                    );
                }
                catch (Exception e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    await ProcessServalApiExceptionAsync(e, doNotThrowIfInProcessEnabled: true);
                }
            }
            else if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
            {
                // Only throw the exception if the In Process instance will not be called below
                throw new DataNotFoundException("The translation engine is not configured");
            }
        }

        // Execute the In Process Machine instance, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            Engine engine = await GetInProcessEngineAsync(sfProjectId, cancellationToken);
            string[] segments = _wordTokenizer.Tokenize(segment).ToArray();
            MachineWordGraph machineWordGraph = await _engineService.GetWordGraphAsync(engine.Id, segments);
            wordGraph = CreateDto(machineWordGraph, segments);
        }

        // This will be null if Serval is down, or if all feature flags are false
        if (wordGraph is null)
        {
            string additionalInfo = await GetAdditionalErrorInformationAsync();
            throw new DataNotFoundException($"No translation engine could be retrieved - {additionalInfo}");
        }

        return wordGraph;
    }

    public async Task<BuildDto> StartBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        BuildDto? buildDto = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    // We do not need the success boolean result, as we will still rebuild if no files have changed
                    await _machineProjectService.SyncProjectCorporaAsync(
                        curUserId,
                        sfProjectId,
                        preTranslate: false,
                        cancellationToken
                    );
                    TranslationBuild translationBuild = await _translationEnginesClient.StartBuildAsync(
                        translationEngineId,
                        new TranslationBuildConfig(),
                        cancellationToken
                    );
                    buildDto = CreateDto(translationBuild);
                }
                catch (Exception e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    await ProcessServalApiExceptionAsync(e, doNotThrowIfInProcessEnabled: true);
                }
            }
            else if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
            {
                // Only throw the exception if the In Process instance will not be called below
                throw new DataNotFoundException("The translation engine is not configured");
            }
        }

        // Execute the In Process Machine instance, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            Engine engine = await GetInProcessEngineAsync(sfProjectId, cancellationToken);
            Build build = await _engineService.StartBuildAsync(engine.Id);
            buildDto = CreateDto(build);
        }

        // This will be null if Serval is down, or if all feature flags are false
        if (buildDto is null)
        {
            string additionalInfo = await GetAdditionalErrorInformationAsync();
            throw new DataNotFoundException($"No translation engine could be retrieved - {additionalInfo}");
        }

        return UpdateDto(buildDto, sfProjectId);
    }

    public async Task StartPreTranslationBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission on the project
        SFProject project = await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            throw new DataNotFoundException("The translation engine does not support pre-translations");
        }

        // If we have an alternate source, sync that first
        string jobId;
        string alternateSourceProjectId = project.TranslateConfig.DraftConfig.AlternateSource?.ProjectRef;
        if (!string.IsNullOrWhiteSpace(alternateSourceProjectId))
        {
            string sourceJobId = await _syncService.SyncAsync(curUserId, alternateSourceProjectId, trainEngine: false);

            // Run the training after the sync has completed
            jobId = _backgroundJobClient.ContinueJobWith<IMachineProjectService>(
                sourceJobId,
                r => r.BuildProjectForBackgroundJobAsync(curUserId, sfProjectId, true, CancellationToken.None)
            );
        }
        else
        {
            // This will take a while, so we run it in the background
            jobId = _backgroundJobClient.Enqueue<IMachineProjectService>(
                r => r.BuildProjectForBackgroundJobAsync(curUserId, sfProjectId, true, CancellationToken.None)
            );
        }

        // Set the pre-translation queued date and time, and hang fire job id
        await _projectSecrets.UpdateAsync(
            sfProjectId,
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

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    await _translationEnginesClient.TrainSegmentAsync(
                        translationEngineId,
                        segmentPair,
                        cancellationToken
                    );
                }
                catch (Exception e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    await ProcessServalApiExceptionAsync(e, doNotThrowIfInProcessEnabled: true);
                }
            }
            else if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
            {
                // Only throw the exception if the In Process instance will not be called below
                throw new DataNotFoundException("The translation engine is not configured");
            }
        }

        // Execute the In Process Machine instance, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            Engine engine = await GetInProcessEngineAsync(sfProjectId, cancellationToken);
            string[] sourceSegment = _wordTokenizer.Tokenize(segmentPair.SourceSegment).ToArray();
            string[] targetSegment = _wordTokenizer.Tokenize(segmentPair.TargetSegment).ToArray();
            await _engineService.TrainSegmentAsync(engine.Id, sourceSegment, targetSegment, segmentPair.SentenceStart);
        }
    }

    public async Task<TranslationResult> TranslateAsync(
        string curUserId,
        string sfProjectId,
        string segment,
        CancellationToken cancellationToken
    )
    {
        TranslationResult? translationResult = null;

        // Ensure that the user has permission
        await EnsureProjectPermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    translationResult = await _translationEnginesClient.TranslateAsync(
                        translationEngineId,
                        segment,
                        cancellationToken
                    );
                }
                catch (Exception e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    await ProcessServalApiExceptionAsync(e, doNotThrowIfInProcessEnabled: true);
                }
            }
            else if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
            {
                // Only throw the exception if the In Process instance will not be called below
                throw new DataNotFoundException("The translation engine is not configured");
            }
        }

        // Execute the In Process Machine instance, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            Engine engine = await GetInProcessEngineAsync(sfProjectId, cancellationToken);
            string[] segments = _wordTokenizer.Tokenize(segment).ToArray();
            MachineTranslationResult machineTranslationResult = await _engineService.TranslateAsync(
                engine.Id,
                segments
            );
            translationResult = CreateDto(machineTranslationResult);
        }

        // This will be null if Serval is down, or if all feature flags are false
        if (translationResult is null)
        {
            string additionalInfo = await GetAdditionalErrorInformationAsync();
            throw new DataNotFoundException($"No translation engine could be retrieved - {additionalInfo}");
        }

        return translationResult;
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

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId, preTranslate: false);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    translationResults = await _translationEnginesClient.TranslateNAsync(
                        translationEngineId,
                        n,
                        segment,
                        cancellationToken
                    );
                }
                catch (Exception e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    await ProcessServalApiExceptionAsync(e, doNotThrowIfInProcessEnabled: true);
                }
            }
            else if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
            {
                // Only throw the exception if the In Process instance will not be called below
                throw new DataNotFoundException("The translation engine is not configured");
            }
        }

        // Execute the In Process Machine instance, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            Engine engine = await GetInProcessEngineAsync(sfProjectId, cancellationToken);
            string[] segments = _wordTokenizer.Tokenize(segment).ToArray();
            IEnumerable<MachineTranslationResult> machineTranslationResults = await _engineService.TranslateAsync(
                engine.Id,
                n,
                segments
            );
            translationResults = machineTranslationResults.Select(CreateDto);
        }

        return translationResults.ToArray();
    }

    private static BuildDto CreateDto(Build build) =>
        new BuildDto
        {
            Id = build.Id,
            Revision = build.Revision,
            PercentCompleted = build.PercentCompleted,
            Message = build.Message,
            State = build.State,
        };

    private static BuildDto CreateDto(TranslationBuild translationBuild) =>
        new BuildDto
        {
            Id = translationBuild.Id,
            Revision = translationBuild.Revision,
            PercentCompleted = translationBuild.PercentCompleted ?? 0.0,
            Message = translationBuild.Message,
            State = translationBuild.State.ToString().ToUpperInvariant(),
        };

    private static EngineDto CreateDto(Engine engine) =>
        new EngineDto
        {
            Id = engine.Id,
            Confidence = engine.Confidence,
            TrainedSegmentCount = engine.TrainedSegmentCount,
            SourceLanguageTag = engine.SourceLanguageTag,
            TargetLanguageTag = engine.TargetLanguageTag,
        };

    private static EngineDto CreateDto(TranslationEngine translationEngine) =>
        new EngineDto
        {
            Id = translationEngine.Id,
            Confidence = translationEngine.Confidence / 100.0,
            TrainedSegmentCount = translationEngine.CorpusSize,
            SourceLanguageTag = translationEngine.SourceLanguage,
            TargetLanguageTag = translationEngine.TargetLanguage,
        };

    private static Phrase CreateDto(MachinePhrase phrase) =>
        new Phrase
        {
            SourceSegmentStart = phrase.SourceSegmentRange.Start,
            SourceSegmentEnd = phrase.SourceSegmentRange.End,
            TargetSegmentCut = phrase.TargetSegmentCut,
        };

    private static TranslationResult CreateDto(MachineTranslationResult translationResult) =>
        new TranslationResult
        {
            SourceTokens = translationResult.SourceSegment.ToArray(),
            TargetTokens = translationResult.TargetSegment.ToArray(),
            Confidences = translationResult.WordConfidences.ToArray(),
            Sources = translationResult.WordSources.Select(CreateDto).ToArray(),
            Alignment = CreateDto(translationResult.Alignment),
            Phrases = translationResult.Phrases.Select(CreateDto).ToArray(),
            Translation = string.Join(' ', translationResult.TargetSegment),
        };

    private static IList<TranslationSource> CreateDto(TranslationSources translationSources)
    {
        List<TranslationSource> translationSourceList = new List<TranslationSource>();
        if (translationSources.HasFlag(TranslationSources.Smt))
            translationSourceList.Add(TranslationSource.Primary);
        if (translationSources.HasFlag(TranslationSources.Transfer))
            translationSourceList.Add(TranslationSource.Secondary);
        if (translationSources.HasFlag(TranslationSources.Prefix))
            translationSourceList.Add(TranslationSource.Human);
        return translationSourceList;
    }

    private static WordGraph CreateDto(MachineWordGraph wordGraph, IList<string> sourceTokens) =>
        new WordGraph
        {
            InitialStateScore = (float)wordGraph.InitialStateScore,
            FinalStates = wordGraph.FinalStates.ToArray(),
            Arcs = wordGraph.Arcs.Select(CreateDto).ToArray(),
            SourceTokens = sourceTokens,
        };

    private static WordGraphArc CreateDto(MachineWordGraphArc arc) =>
        new WordGraphArc
        {
            PrevState = arc.PrevState,
            NextState = arc.NextState,
            Score = (float)arc.Score,
            TargetTokens = arc.Words.ToArray(),
            Confidences = arc.WordConfidences.ToArray(),
            SourceSegmentStart = arc.SourceSegmentRange.Start,
            SourceSegmentEnd = arc.SourceSegmentRange.End,
            Sources = arc.WordSources.Select(CreateDto).ToArray(),
            Alignment = CreateDto(arc.Alignment),
        };

    private static AlignedWordPair[] CreateDto(WordAlignmentMatrix matrix)
    {
        var wordPairs = new List<AlignedWordPair>();
        for (int i = 0; i < matrix.RowCount; i++)
        {
            for (int j = 0; j < matrix.ColumnCount; j++)
            {
                if (matrix[i, j])
                {
                    wordPairs.Add(new AlignedWordPair { SourceIndex = i, TargetIndex = j });
                }
            }
        }

        return wordPairs.ToArray();
    }

    /// <summary>
    /// This method maps Serval API exceptions to the exceptions that Machine.js understands.
    /// </summary>
    /// <param name="e">The Serval API Exception</param>
    /// <param name="doNotThrowIfInProcessEnabled">Report but do not throw the exception if in-process machine is enabled</param>
    /// <exception cref="DataNotFoundException">Entity Deleted.</exception>
    /// <exception cref="ForbiddenException">Access Denied.</exception>
    /// <remarks>If this method returns, it is expected that the DTO will be null.</remarks>
    private async Task ProcessServalApiExceptionAsync(Exception e, bool doNotThrowIfInProcessEnabled = false)
    {
        switch (e)
        {
            case ServalApiException
                when doNotThrowIfInProcessEnabled
                    && await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess):
                _exceptionHandler.ReportException(e);
                return;
            case ServalApiException { StatusCode: StatusCodes.Status204NoContent }:
                throw new DataNotFoundException("Entity Deleted");
            case ServalApiException { StatusCode: StatusCodes.Status403Forbidden }:
                throw new ForbiddenException();
            case ServalApiException { StatusCode: StatusCodes.Status404NotFound }:
                throw new DataNotFoundException("Entity Deleted");
            case ServalApiException { StatusCode: StatusCodes.Status405MethodNotAllowed }:
                throw new NotSupportedException();
            case ServalApiException { StatusCode: StatusCodes.Status408RequestTimeout }:
                return;
            case ServalApiException { StatusCode: StatusCodes.Status409Conflict }:
                throw new DataNotFoundException("Entity Deleted");
            case BrokenCircuitException
                when doNotThrowIfInProcessEnabled
                    && await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess):
                _exceptionHandler.ReportException(e);
                return;
            default:
                throw e;
        }
    }

    private static BuildDto UpdateDto(BuildDto buildDto, string sfProjectId)
    {
        buildDto.Href = MachineApi.GetBuildHref(sfProjectId, buildDto.Id);
        buildDto.Engine = new ResourceDto { Id = sfProjectId, Href = MachineApi.GetEngineHref(sfProjectId) };

        // We use this special ID format so that the DTO ID can be an optional URL parameter
        buildDto.Id = $"{sfProjectId}.{buildDto.Id}";
        return buildDto;
    }

    private static EngineDto UpdateDto(EngineDto engineDto, string sfProjectId)
    {
        engineDto.Href = MachineApi.GetEngineHref(sfProjectId);
        engineDto.Id = sfProjectId;
        engineDto.Projects = new[]
        {
            new ResourceDto { Href = MachineApi.GetEngineHref(sfProjectId), Id = sfProjectId },
        };
        return engineDto;
    }

    private async Task<SFProject> EnsureProjectPermissionAsync(string curUserId, string sfProjectId)
    {
        // Load the project from the realtime service
        Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(sfProjectId);
        if (!attempt.TryResult(out SFProject project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Check for permission
        if (
            !(
                project.UserRoles.TryGetValue(curUserId, out string role)
                && role is SFProjectRole.Administrator or SFProjectRole.Translator
            )
        )
        {
            throw new ForbiddenException();
        }

        return project;
    }

    /// <summary>
    /// Generates additional information for an error message to help debugging.
    /// </summary>
    /// <returns>A string describing the Machine or Serval state.</returns>
    private async Task<string> GetAdditionalErrorInformationAsync()
    {
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            return "Is Serval Down?";
        }

        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            return "Is the project configured in Machine?";
        }

        return "The Serval and Machine Feature Flags are not configured";
    }

    private async Task<BuildDto?> GetInProcessBuildAsync(
        BuildLocatorType locatorType,
        string locator,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        BuildDto? buildDto = null;
        Build? build;
        if (minRevision is not null)
        {
            EntityChange<Build> change = await _builds
                .GetNewerRevisionAsync(locatorType, locator, minRevision.Value, cancellationToken)
                .Timeout(_engineOptions.Value.BuildLongPollTimeout, cancellationToken);
            build = change.Entity;
            if (change.Type == EntityChangeType.Delete)
            {
                throw new DataNotFoundException("Entity Deleted");
            }
        }
        else
        {
            build = await _builds.GetByLocatorAsync(locatorType, locator, cancellationToken);
        }

        if (build is not null)
        {
            buildDto = CreateDto(build);
        }

        return buildDto;
    }

    private async Task<Engine> GetInProcessEngineAsync(string sfProjectId, CancellationToken cancellationToken)
    {
        Engine? engine = await _engines.GetByLocatorAsync(EngineLocatorType.Project, sfProjectId, cancellationToken);
        return engine ?? throw new DataNotFoundException("The engine does not exist.");
    }

    private async Task<string> GetTranslationIdAsync(string sfProjectId, bool preTranslate)
    {
        // Load the project secret, so we can get the translation engine ID
        if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            return string.Empty;
        }

        // Ensure we have a translation engine ID
        string? translationEngineId = preTranslate
            ? projectSecret.ServalData?.PreTranslationEngineId
            : projectSecret.ServalData?.TranslationEngineId;
        return string.IsNullOrWhiteSpace(translationEngineId) ? string.Empty : translationEngineId;
    }
}
