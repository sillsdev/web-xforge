using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Machine.Annotations;
using SIL.Machine.Threading;
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

    public async Task<BuildDto?> GetBuildAsync(
        string curUserId,
        string sfProjectId,
        string buildId,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        BuildDto? buildDto = null;

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
            catch (ServalApiException e)
            {
                ProcessServalApiException(e);
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

    public async Task<BuildDto?> GetCurrentBuildAsync(
        string curUserId,
        string sfProjectId,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        BuildDto? buildDto = null;

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

            try
            {
                TranslationBuild translationBuild = await _translationEnginesClient.GetCurrentBuildAsync(
                    translationEngineId,
                    minRevision,
                    cancellationToken
                );
                buildDto = CreateDto(translationBuild);
            }
            catch (ServalApiException e)
            {
                ProcessServalApiException(e);
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
        await EnsurePermissionAsync(curUserId, sfProjectId);

        // Execute on Serval, if it is enabled
        if (await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            string translationEngineId = await GetTranslationIdAsync(sfProjectId);
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
                catch (ServalApiException e)
                {
                    ProcessServalApiException(e);
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
            string additionalInfo = await GetAdditionalErrorInformationAsync();
            throw new DataNotFoundException($"No translation engine could be retrieved - {additionalInfo}");
        }

        // Make sure the DTO conforms to the machine-api V2 URLs
        return UpdateDto(engineDto, sfProjectId);
    }

    public async Task<WordGraphDto> GetWordGraphAsync(
        string curUserId,
        string sfProjectId,
        IReadOnlyList<string> segment,
        CancellationToken cancellationToken
    )
    {
        WordGraphDto? wordGraphDto = null;

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
                    WordGraph wordGraph = await _translationEnginesClient.GetWordGraphAsync(
                        translationEngineId,
                        string.Join(' ', segment),
                        cancellationToken
                    );
                    wordGraphDto = CreateDto(wordGraph);
                }
                catch (ServalApiException e)
                {
                    ProcessServalApiException(e);
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
            MachineWordGraph wordGraph = await _engineService.GetWordGraphAsync(engine.Id, segment);
            wordGraphDto = CreateDto(wordGraph);
        }

        // This will be null if Serval is down, or if all feature flags are false
        if (wordGraphDto is null)
        {
            string additionalInfo = await GetAdditionalErrorInformationAsync();
            throw new DataNotFoundException($"No translation engine could be retrieved - {additionalInfo}");
        }

        return wordGraphDto;
    }

    public async Task<BuildDto> StartBuildAsync(
        string curUserId,
        string sfProjectId,
        CancellationToken cancellationToken
    )
    {
        BuildDto? buildDto = null;

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
                    await _machineProjectService.SyncProjectCorporaAsync(curUserId, sfProjectId, cancellationToken);
                    TranslationBuild translationBuild = await _translationEnginesClient.StartBuildAsync(
                        translationEngineId,
                        cancellationToken
                    );
                    buildDto = CreateDto(translationBuild);
                }
                catch (ServalApiException e)
                {
                    ProcessServalApiException(e);
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
            string additionalInfo = await GetAdditionalErrorInformationAsync();
            throw new DataNotFoundException($"No translation engine could be retrieved - {additionalInfo}");
        }

        return UpdateDto(buildDto, sfProjectId);
    }

    public async Task TrainSegmentAsync(
        string curUserId,
        string sfProjectId,
        SegmentPairDto segmentPair,
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
                        GetSegmentPair(segmentPair),
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
                segmentPair.SourceSegment,
                segmentPair.TargetSegment,
                segmentPair.SentenceStart
            );
        }
    }

    public async Task<TranslationResultDto> TranslateAsync(
        string curUserId,
        string sfProjectId,
        IReadOnlyList<string> segment,
        CancellationToken cancellationToken
    )
    {
        TranslationResultDto? translationResultDto = null;

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
                    TranslationResult translationResult = await _translationEnginesClient.TranslateAsync(
                        translationEngineId,
                        string.Join(' ', segment),
                        cancellationToken
                    );
                    translationResultDto = CreateDto(translationResult);
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
            MachineTranslationResult translationResult = await _engineService.TranslateAsync(engine.Id, segment);
            translationResultDto = CreateDto(translationResult);
        }

        // This will be null if Serval is down, or if all feature flags are false
        if (translationResultDto is null)
        {
            string additionalInfo = await GetAdditionalErrorInformationAsync();
            throw new DataNotFoundException($"No translation engine could be retrieved - {additionalInfo}");
        }

        return translationResultDto;
    }

    public async Task<TranslationResultDto[]> TranslateNAsync(
        string curUserId,
        string sfProjectId,
        int n,
        IReadOnlyList<string> segment,
        CancellationToken cancellationToken
    )
    {
        IEnumerable<TranslationResultDto> translationResultsDto = Array.Empty<TranslationResultDto>();

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
                    IList<TranslationResult> translationResults = await _translationEnginesClient.TranslateNAsync(
                        translationEngineId,
                        n,
                        string.Join(' ', segment),
                        cancellationToken
                    );
                    translationResultsDto = translationResults.Select(CreateDto);
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
            IEnumerable<MachineTranslationResult> translationResults = await _engineService.TranslateAsync(
                engine.Id,
                n,
                segment
            );
            translationResultsDto = translationResults.Select(CreateDto);
        }

        return translationResultsDto.ToArray();
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

    private static PhraseDto CreateDto(MachinePhrase phrase) =>
        new PhraseDto
        {
            SourceSegmentRange = CreateDto(phrase.SourceSegmentRange),
            TargetSegmentCut = phrase.TargetSegmentCut,
            Confidence = phrase.Confidence,
        };

    private static PhraseDto CreateDto(Phrase phrase) =>
        new PhraseDto
        {
            SourceSegmentRange = CreateRangeDto(phrase),
            TargetSegmentCut = phrase.TargetSegmentCut,
            Confidence = phrase.Confidence,
        };

    private static RangeDto CreateDto(Range<int> range) => new RangeDto { Start = range.Start, End = range.End };

    private static TranslationResultDto CreateDto(MachineTranslationResult translationResult) =>
        new TranslationResultDto
        {
            Target = translationResult.TargetSegment.ToArray(),
            Confidences = translationResult.WordConfidences.Select(c => (float)c).ToArray(),
            Sources = translationResult.WordSources.ToArray(),
            Alignment = CreateDto(translationResult.Alignment),
            Phrases = translationResult.Phrases.Select(CreateDto).ToArray(),
        };

    private static TranslationResultDto CreateDto(TranslationResult translationResult) =>
        new TranslationResultDto
        {
            Target = translationResult.Tokens.ToArray(),
            Confidences = translationResult.Confidences.ToArray(),
            Sources = translationResult.Sources.Select(CreateDto).ToArray(),
            Alignment = translationResult.Alignment.Select(CreateDto).ToArray(),
            Phrases = translationResult.Phrases.Select(CreateDto).ToArray(),
        };

    private static TranslationSources CreateDto(IList<TranslationSource> translationSourceList)
    {
        TranslationSources translationSources = TranslationSources.None;
        if (translationSourceList.Contains(TranslationSource.Primary))
        {
            translationSources |= TranslationSources.Smt;
        }

        if (translationSourceList.Contains(TranslationSource.Secondary))
        {
            translationSources |= TranslationSources.Transfer;
        }

        if (translationSourceList.Contains(TranslationSource.Human))
        {
            translationSources |= TranslationSources.Prefix;
        }

        return translationSources;
    }

    private static WordGraphDto CreateDto(MachineWordGraph wordGraph) =>
        new WordGraphDto
        {
            InitialStateScore = (float)wordGraph.InitialStateScore,
            FinalStates = wordGraph.FinalStates.ToArray(),
            Arcs = wordGraph.Arcs.Select(CreateDto).ToArray(),
        };

    private static WordGraphDto CreateDto(WordGraph wordGraph) =>
        new WordGraphDto
        {
            InitialStateScore = wordGraph.InitialStateScore,
            FinalStates = wordGraph.FinalStates.ToArray(),
            Arcs = wordGraph.Arcs.Select(CreateDto).ToArray(),
        };

    private static WordGraphArcDto CreateDto(MachineWordGraphArc arc) =>
        new WordGraphArcDto
        {
            PrevState = arc.PrevState,
            NextState = arc.NextState,
            Score = (float)arc.Score,
            Words = arc.Words.ToArray(),
            Confidences = arc.WordConfidences.Select(c => (float)c).ToArray(),
            SourceSegmentRange = CreateDto(arc.SourceSegmentRange),
            Sources = arc.WordSources.ToArray(),
            Alignment = CreateDto(arc.Alignment),
        };

    private static WordGraphArcDto CreateDto(WordGraphArc arc) =>
        new WordGraphArcDto
        {
            PrevState = arc.PrevState,
            NextState = arc.NextState,
            Score = arc.Score,
            Words = arc.Tokens.ToArray(),
            Confidences = arc.Confidences.ToArray(),
            SourceSegmentRange = CreateRangeDto(arc),
            Sources = arc.Sources.Select(CreateDto).ToArray(),
            Alignment = arc.Alignment.Select(CreateDto).ToArray(),
        };

    private static AlignedWordPairDto[] CreateDto(WordAlignmentMatrix matrix)
    {
        var wordPairs = new List<AlignedWordPairDto>();
        for (int i = 0; i < matrix.RowCount; i++)
        {
            for (int j = 0; j < matrix.ColumnCount; j++)
            {
                if (matrix[i, j])
                {
                    wordPairs.Add(new AlignedWordPairDto { SourceIndex = i, TargetIndex = j });
                }
            }
        }

        return wordPairs.ToArray();
    }

    private static AlignedWordPairDto CreateDto(AlignedWordPair alignedWordPair) =>
        new AlignedWordPairDto { SourceIndex = alignedWordPair.SourceIndex, TargetIndex = alignedWordPair.TargetIndex };

    private static RangeDto CreateRangeDto(Phrase phrase) =>
        new RangeDto { Start = phrase.SourceSegmentStart, End = phrase.SourceSegmentEnd };

    private static RangeDto CreateRangeDto(WordGraphArc arc) =>
        new RangeDto { Start = arc.SourceSegmentStart, End = arc.SourceSegmentEnd };

    private static SegmentPair GetSegmentPair(SegmentPairDto segmentPairDto) =>
        new SegmentPair
        {
            SentenceStart = segmentPairDto.SentenceStart,
            SourceSegment = string.Join(' ', segmentPairDto.SourceSegment ?? Array.Empty<string>()),
            TargetSegment = string.Join(' ', segmentPairDto.TargetSegment ?? Array.Empty<string>()),
        };

    /// <summary>
    /// This method maps Serval API exceptions to the exceptions that Machine.js understands.
    /// </summary>
    /// <param name="e">The Serval API Exception</param>
    /// <exception cref="DataNotFoundException">Entity Deleted.</exception>
    /// <exception cref="ForbiddenException">Access Denied.</exception>
    /// <remarks>If this method returns, it is expected that the DTO will be null.</remarks>
    private static void ProcessServalApiException(ServalApiException e)
    {
        switch (e.StatusCode)
        {
            case StatusCodes.Status204NoContent:
                throw new DataNotFoundException("Entity Deleted");
            case StatusCodes.Status403Forbidden:
                throw new ForbiddenException();
            case StatusCodes.Status404NotFound:
                throw new DataNotFoundException("Entity Deleted");
            case StatusCodes.Status408RequestTimeout:
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
