using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Machine.Threading;
using SIL.Machine.Translation;
using SIL.Machine.WebApi.Configuration;
using SIL.Machine.WebApi.DataAccess;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// The Machine API service for use with <see cref="Controllers.MachineApiController"/>.
/// </summary>
public class MachineApiService : IMachineApiService
{
    private readonly IBuildRepository _builds;
    private readonly IEngineRepository _engines;
    private readonly IOptions<EngineOptions> _engineOptions;
    private readonly IEngineService _engineService;
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IFeatureManager _featureManager;
    private readonly IMachineProjectService _machineProjectService;
    private readonly DataAccess.IRepository<SFProjectSecret> _projectSecrets;
    private readonly IRealtimeService _realtimeService;
    private readonly ITranslationEnginesClient _translationEnginesClient;

    public MachineApiService(
        IBuildRepository builds,
        IEngineRepository engines,
        IOptions<EngineOptions> engineOptions,
        IEngineService engineService,
        IExceptionHandler exceptionHandler,
        IFeatureManager featureManager,
        IMachineProjectService machineProjectService,
        DataAccess.IRepository<SFProjectSecret> projectSecrets,
        IRealtimeService realtimeService,
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
        _machineProjectService = machineProjectService;
        _projectSecrets = projectSecrets;
        _realtimeService = realtimeService;
        _translationEnginesClient = translationEnginesClient;
    }

    public async Task<TranslationBuild?> GetBuildAsync(
        string curUserId,
        string sfProjectId,
        string buildId,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        TranslationBuild? buildDto;

        // Ensure that the user has permission
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // Execute the In Process Machine instance, if it is enabled
        // We can only use In Process or the API - not both or unnecessary delays will result
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            buildDto = await GetInProcessBuildAsync(BuildLocatorType.Id, buildId, minRevision, cancellationToken);
        }
        else if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            // Execute on Serval, if it is enabled
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                throw new DataNotFoundException("The translation engine is not configured");
            }

            buildDto = await _translationEnginesClient.GetBuildAsync(
                translationEngineId,
                buildId,
                minRevision,
                cancellationToken
            );
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

    public async Task<TranslationBuild?> GetCurrentBuildAsync(
        string curUserId,
        string sfProjectId,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        TranslationBuild? buildDto;

        // Ensure that the user has permission
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // We can only use In Process or the API - not both or unnecessary delays will result
        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            // Execute the In Process Machine instance, if it is enabled
            Engine engine = await GetInProcessEngineAsync(sfProjectId, cancellationToken);
            buildDto = await GetInProcessBuildAsync(BuildLocatorType.Engine, engine.Id, minRevision, cancellationToken);
        }
        else if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            // Otherwise execute on Serval, if it is enabled
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                throw new DataNotFoundException("The translation engine is not configured");
            }

            buildDto = await _translationEnginesClient.GetCurrentBuildAsync(
                translationEngineId,
                minRevision,
                cancellationToken
            );
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

    public async Task<TranslationEngine> GetEngineAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        TranslationEngine? engineDto = null;

        // Ensure that the user has permission
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    engineDto = await _translationEnginesClient.GetAsync(translationEngineId, cancellationToken);
                }
                catch (BrokenCircuitException e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
                    {
                        _exceptionHandler.ReportException(e);
                    }
                    else
                    {
                        throw;
                    }
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
            throw new DataNotFoundException("No translation engine could be retrieved");
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        return UpdateDto(engineDto, sfProjectId);
    }

    public async Task<Serval.Client.WordGraph> GetWordGraphAsync(
        string curUserId,
        string sfProjectId,
        string[] segment,
        CancellationToken cancellationToken
    )
    {
        Serval.Client.WordGraph? wordGraphDto = null;

        // Ensure that the user has permission
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    wordGraphDto = await _translationEnginesClient.GetWordGraphAsync(
                        translationEngineId,
                        string.Join(' ', segment),
                        cancellationToken
                    );
                }
                catch (BrokenCircuitException e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
                    {
                        _exceptionHandler.ReportException(e);
                    }
                    else
                    {
                        throw;
                    }
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
            Machine.Translation.WordGraph wordGraph = await _engineService.GetWordGraphAsync(engine.Id, segment);
            wordGraphDto = CreateDto(wordGraph);
        }

        // This will be null if Serval is down, or if all feature flags are false
        if (wordGraphDto is null)
        {
            throw new DataNotFoundException("No translation engine could be retrieved");
        }

        return wordGraphDto;
    }

    public async Task<TranslationBuild> StartBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        TranslationBuild? buildDto = null;

        // Ensure that the user has permission
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    // We do not need the success boolean result, as we will still rebuild if no files have changed
                    _ = await _machineProjectService.SyncProjectCorporaAsync(curUserId, sfProjectId, cancellationToken);
                    buildDto = await _translationEnginesClient.StartBuildAsync(translationEngineId, cancellationToken);
                }
                catch (BrokenCircuitException e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
                    {
                        _exceptionHandler.ReportException(e);
                    }
                    else
                    {
                        throw;
                    }
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
            throw new DataNotFoundException("No translation engine could be retrieved");
        }

        return UpdateDto(buildDto, sfProjectId);
    }

    public async Task TrainSegmentAsync(
        string curUserId,
        string sfProjectId,
        SegmentPair segmentPair,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the user has permission
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
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
                catch (BrokenCircuitException e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
                    {
                        _exceptionHandler.ReportException(e);
                    }
                    else
                    {
                        throw;
                    }
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
            await _engineService.TrainSegmentAsync(
                engine.Id,
                new[] { segmentPair.SourceSegment },
                new[] { segmentPair.TargetSegment },
                segmentPair.SentenceStart
            );
        }
    }

    public async Task<Serval.Client.TranslationResult> TranslateAsync(
        string curUserId,
        string sfProjectId,
        string[] segment,
        CancellationToken cancellationToken
    )
    {
        Serval.Client.TranslationResult? translationResultDto = null;

        // Ensure that the user has permission
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    translationResultDto = await _translationEnginesClient.TranslateAsync(
                        translationEngineId,
                        string.Join(' ', segment),
                        cancellationToken
                    );
                }
                catch (BrokenCircuitException e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
                    {
                        _exceptionHandler.ReportException(e);
                    }
                    else
                    {
                        throw;
                    }
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
            Machine.Translation.TranslationResult translationResult = await _engineService.TranslateAsync(
                engine.Id,
                segment
            );
            translationResultDto = CreateDto(translationResult);
        }

        // This will be null if Serval is down, or if all feature flags are false
        if (translationResultDto is null)
        {
            throw new DataNotFoundException("No translation engine could be retrieved");
        }

        return translationResultDto;
    }

    public async Task<Serval.Client.TranslationResult[]> TranslateNAsync(
        string curUserId,
        string sfProjectId,
        int n,
        string[] segment,
        CancellationToken cancellationToken
    )
    {
        IEnumerable<Serval.Client.TranslationResult> translationResultsDto =
            Array.Empty<Serval.Client.TranslationResult>();

        // Ensure that the user has permission
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
            if (!string.IsNullOrWhiteSpace(translationEngineId))
            {
                try
                {
                    translationResultsDto = await _translationEnginesClient.TranslateNAsync(
                        translationEngineId,
                        n,
                        string.Join(' ', segment),
                        cancellationToken
                    );
                }
                catch (BrokenCircuitException e)
                {
                    // We do not want to throw the error if we are returning from In Process API below
                    if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
                    {
                        _exceptionHandler.ReportException(e);
                    }
                    else
                    {
                        throw;
                    }
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
            IEnumerable<Machine.Translation.TranslationResult> translationResults = await _engineService.TranslateAsync(
                engine.Id,
                n,
                segment
            );
            translationResultsDto = translationResults.Select(CreateDto);
        }

        return translationResultsDto.ToArray();
    }

    private static TranslationBuild CreateDto(Build build) =>
        new TranslationBuild
        {
            Id = build.Id,
            DateFinished = build.DateFinished,
            Revision = build.Revision,
            PercentCompleted = build.PercentCompleted,
            Message = build.Message,
            State = Enum.Parse<JobState>(build.State, true),
        };

    private static TranslationEngine CreateDto(Engine engine) =>
        new TranslationEngine
        {
            Confidence = engine.Confidence,
            SourceLanguage = engine.SourceLanguageTag,
            TargetLanguage = engine.TargetLanguageTag,
        };

    private static Serval.Client.Phrase CreateDto(Machine.Translation.Phrase phrase) =>
        new Serval.Client.Phrase
        {
            SourceSegmentStart = phrase.SourceSegmentRange.Start,
            SourceSegmentEnd = phrase.SourceSegmentRange.End,
            TargetSegmentCut = phrase.TargetSegmentCut,
            Confidence = phrase.Confidence,
        };

    private static Serval.Client.TranslationResult CreateDto(Machine.Translation.TranslationResult translationResult) =>
        new Serval.Client.TranslationResult
        {
            Tokens = translationResult.TargetSegment.ToArray(),
            Confidences = translationResult.WordConfidences.Select(c => (float)c).ToArray(),
            Sources = translationResult.WordSources.Select(CreateDto).ToArray(),
            Alignment = CreateDto(translationResult.Alignment),
            Phrases = translationResult.Phrases.Select(CreateDto).ToArray(),
        };

    private static Serval.Client.TranslationSources CreateDto(Machine.Translation.TranslationSources translationSources)
    {
        // The two enums have different values, so we must map manually
        // TODO: When Serval.Client has updated, change to None
        Serval.Client.TranslationSources newTranslationSources = 0;
        if (
            (translationSources & Machine.Translation.TranslationSources.Smt)
            == Machine.Translation.TranslationSources.Smt
        )
            newTranslationSources |= Serval.Client.TranslationSources.Smt;
        if (
            (translationSources & Machine.Translation.TranslationSources.Transfer)
            == Machine.Translation.TranslationSources.Transfer
        )
            newTranslationSources |= Serval.Client.TranslationSources.Transfer;
        if (
            (translationSources & Machine.Translation.TranslationSources.Prefix)
            == Machine.Translation.TranslationSources.Prefix
        )
            newTranslationSources |= Serval.Client.TranslationSources.Prefix;
        return newTranslationSources;
    }

    private static Serval.Client.WordGraph CreateDto(Machine.Translation.WordGraph wordGraph) =>
        new Serval.Client.WordGraph
        {
            InitialStateScore = (float)wordGraph.InitialStateScore,
            FinalStates = wordGraph.FinalStates.ToArray(),
            Arcs = wordGraph.Arcs.Select(CreateDto).ToArray(),
        };

    private static Serval.Client.WordGraphArc CreateDto(Machine.Translation.WordGraphArc arc) =>
        new Serval.Client.WordGraphArc
        {
            PrevState = arc.PrevState,
            NextState = arc.NextState,
            Score = (float)arc.Score,
            Tokens = arc.Words.ToArray(),
            Confidences = arc.WordConfidences.Select(c => (float)c).ToArray(),
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

    private static TranslationBuild UpdateDto(TranslationBuild buildDto, string sfProjectId)
    {
        buildDto.Url = MachineApi.GetBuildUrl(sfProjectId, buildDto.Id);
        buildDto.Engine = new ResourceLink { Id = sfProjectId, Url = MachineApi.GetEngineUrl(sfProjectId) };

        // We use this special ID format so that the DTO ID can be an optional URL parameter
        buildDto.Id = $"{sfProjectId}.{buildDto.Id}";
        return buildDto;
    }

    private static TranslationEngine UpdateDto(TranslationEngine engineDto, string sfProjectId)
    {
        engineDto.Url = MachineApi.GetEngineUrl(sfProjectId);
        engineDto.Id = sfProjectId;
        return engineDto;
    }

    private async Task EnsurePermissionAsync(string curUserId, string sfProjectId)
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
    }

    private async Task<TranslationBuild?> GetInProcessBuildAsync(
        BuildLocatorType locatorType,
        string locator,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        TranslationBuild? buildDto = null;
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

    private async Task<string> GetTranslationIdAsync(string sfProjectId)
    {
        // Load the project secret, so we can get the translation engine ID
        if (!(await _projectSecrets.TryGetAsync(sfProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            return string.Empty;
        }

        // Ensure we have a translation engine ID
        string? translationEngineId = projectSecret.ServalData?.TranslationEngineId;
        return string.IsNullOrWhiteSpace(translationEngineId) ? string.Empty : translationEngineId;
    }
}
