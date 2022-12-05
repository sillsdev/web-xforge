using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Polly.CircuitBreaker;
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

namespace SIL.XForge.Scripture.Services
{
    public class MachineApiService : IMachineApiService
    {
        private readonly IBuildRepository _builds;
        private readonly IEngineRepository _engines;
        private readonly IOptions<EngineOptions> _engineOptions;
        private readonly IEngineService _engineService;
        private readonly IExceptionHandler _exceptionHandler;
        private readonly IFeatureManager _featureManager;
        private readonly IMachineBuildService _machineBuildService;
        private readonly IMachineProjectService _machineProjectService;
        private readonly IMachineTranslationService _machineTranslationService;
        private readonly DataAccess.IRepository<SFProjectSecret> _projectSecrets;
        private readonly IRealtimeService _realtimeService;

        public MachineApiService(
            IBuildRepository builds,
            IEngineRepository engines,
            IOptions<EngineOptions> engineOptions,
            IEngineService engineService,
            IExceptionHandler exceptionHandler,
            IFeatureManager featureManager,
            IMachineBuildService machineBuildService,
            IMachineProjectService machineProjectService,
            IMachineTranslationService machineTranslationService,
            DataAccess.IRepository<SFProjectSecret> projectSecrets,
            IRealtimeService realtimeService
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

            // Machine API Dependencies
            _machineBuildService = machineBuildService;
            _machineProjectService = machineProjectService;
            _machineTranslationService = machineTranslationService;
            _projectSecrets = projectSecrets;
            _realtimeService = realtimeService;
        }

        public async Task<BuildDto?> GetBuildAsync(
            string curUserId,
            string projectId,
            string buildId,
            long? minRevision,
            CancellationToken cancellationToken
        )
        {
            BuildDto? buildDto = null;

            // Ensure that the user has permission
            await EnsurePermissionAsync(curUserId, projectId);

            // Execute the In Process Machine instance, if it is enabled
            // We can only use In Process or the API - not both or unnecessary delays will result
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
            {
                buildDto = await GetInProcessBuildAsync(BuildLocatorType.Id, buildId, minRevision, cancellationToken);
            }
            else if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                // Execute the Machine API, if it is enabled
                string translationEngineId = await GetTranslationIdAsync(projectId);
                if (string.IsNullOrWhiteSpace(translationEngineId))
                {
                    throw new DataNotFoundException("The translation engine is not configured");
                }

                buildDto = await _machineBuildService.GetBuildAsync(
                    translationEngineId,
                    buildId,
                    minRevision,
                    cancellationToken
                );
            }

            // Make sure the DTO conforms to the machine-api V2 URLs
            if (buildDto is not null)
            {
                UpdateDto(buildDto, projectId);
            }

            return buildDto;
        }

        public async Task<BuildDto?> GetCurrentBuildAsync(
            string curUserId,
            string projectId,
            long? minRevision,
            CancellationToken cancellationToken
        )
        {
            BuildDto? buildDto = null;

            // Ensure that the user has permission
            await EnsurePermissionAsync(curUserId, projectId);

            // We can only use In Process or the API - not both or unnecessary delays will result
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
            {
                // Execute the In Process Machine instance, if it is enabled
                Engine engine = await GetInProcessEngineAsync(projectId, cancellationToken);
                buildDto = await GetInProcessBuildAsync(
                    BuildLocatorType.Engine,
                    engine.Id,
                    minRevision,
                    cancellationToken
                );
            }
            else if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                // Otherwise, execute the Machine API, if it is enabled
                string translationEngineId = await GetTranslationIdAsync(projectId);
                if (string.IsNullOrWhiteSpace(translationEngineId))
                {
                    throw new DataNotFoundException("The translation engine is not configured");
                }

                buildDto = await _machineBuildService.GetCurrentBuildAsync(
                    translationEngineId,
                    minRevision,
                    cancellationToken
                );
            }

            // Make sure the DTO conforms to the machine-api V2 URLs
            if (buildDto is not null)
            {
                UpdateDto(buildDto, projectId);
            }

            return buildDto;
        }

        public async Task<EngineDto> GetEngineAsync(
            string curUserId,
            string projectId,
            CancellationToken cancellationToken
        )
        {
            var engineDto = new EngineDto();

            // Ensure that the user has permission
            await EnsurePermissionAsync(curUserId, projectId);

            // Execute the Machine API, if it is enabled
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                string translationEngineId = await GetTranslationIdAsync(projectId);
                if (!string.IsNullOrWhiteSpace(translationEngineId))
                {
                    try
                    {
                        MachineApiTranslationEngine translationEngine =
                            await _machineTranslationService.GetTranslationEngineAsync(
                                translationEngineId,
                                cancellationToken
                            );
                        engineDto = CreateDto(translationEngine);
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
                Engine engine = await GetInProcessEngineAsync(projectId, cancellationToken);
                engineDto = CreateDto(engine);
            }

            // Make sure the DTO conforms to the machine-api V2 URLs
            return UpdateDto(engineDto, projectId);
        }

        public async Task<WordGraphDto> GetWordGraphAsync(
            string curUserId,
            string projectId,
            IReadOnlyList<string> segment,
            CancellationToken cancellationToken
        )
        {
            var wordGraphDto = new WordGraphDto();

            // Ensure that the user has permission
            await EnsurePermissionAsync(curUserId, projectId);

            // Execute the Machine API, if it is enabled
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                string translationEngineId = await GetTranslationIdAsync(projectId);
                if (!string.IsNullOrWhiteSpace(translationEngineId))
                {
                    try
                    {
                        wordGraphDto = await _machineTranslationService.GetWordGraphAsync(
                            translationEngineId,
                            segment,
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
                Engine engine = await GetInProcessEngineAsync(projectId, cancellationToken);
                WordGraph wordGraph = await _engineService.GetWordGraphAsync(engine.Id, segment);
                wordGraphDto = CreateDto(wordGraph);
            }

            return wordGraphDto;
        }

        public async Task<BuildDto> StartBuildAsync(
            string curUserId,
            string projectId,
            CancellationToken cancellationToken
        )
        {
            var buildDto = new BuildDto();

            // Ensure that the user has permission
            await EnsurePermissionAsync(curUserId, projectId);

            // Execute the Machine API, if it is enabled
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                string translationEngineId = await GetTranslationIdAsync(projectId);
                if (!string.IsNullOrWhiteSpace(translationEngineId))
                {
                    try
                    {
                        // We do not need the success boolean result, as we will still rebuild if no files have changed
                        _ = await _machineProjectService.SyncProjectCorporaAsync(
                            curUserId,
                            projectId,
                            cancellationToken
                        );
                        buildDto = await _machineBuildService.StartBuildAsync(translationEngineId, cancellationToken);
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
                Engine engine = await GetInProcessEngineAsync(projectId, cancellationToken);
                Build build = await _engineService.StartBuildAsync(engine.Id);
                buildDto = CreateDto(build);
            }

            return UpdateDto(buildDto, projectId);
        }

        public async Task TrainSegmentAsync(
            string curUserId,
            string projectId,
            SegmentPairDto segmentPair,
            CancellationToken cancellationToken
        )
        {
            // Ensure that the user has permission
            await EnsurePermissionAsync(curUserId, projectId);

            // Execute the Machine API, if it is enabled
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                string translationEngineId = await GetTranslationIdAsync(projectId);
                if (!string.IsNullOrWhiteSpace(translationEngineId))
                {
                    try
                    {
                        await _machineTranslationService.TrainSegmentAsync(
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
                Engine engine = await GetInProcessEngineAsync(projectId, cancellationToken);
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
            string projectId,
            IReadOnlyList<string> segment,
            CancellationToken cancellationToken
        )
        {
            var translationResultDto = new TranslationResultDto();

            // Ensure that the user has permission
            await EnsurePermissionAsync(curUserId, projectId);

            // Execute the Machine API, if it is enabled
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                string translationEngineId = await GetTranslationIdAsync(projectId);
                if (!string.IsNullOrWhiteSpace(translationEngineId))
                {
                    try
                    {
                        translationResultDto = await _machineTranslationService.TranslateAsync(
                            translationEngineId,
                            segment,
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
                Engine engine = await GetInProcessEngineAsync(projectId, cancellationToken);
                TranslationResult translationResult = await _engineService.TranslateAsync(engine.Id, segment);
                translationResultDto = CreateDto(translationResult);
            }

            return translationResultDto;
        }

        public async Task<TranslationResultDto[]> TranslateNAsync(
            string curUserId,
            string projectId,
            int n,
            IReadOnlyList<string> segment,
            CancellationToken cancellationToken
        )
        {
            TranslationResultDto[] translationResultsDto = Array.Empty<TranslationResultDto>();

            // Ensure that the user has permission
            await EnsurePermissionAsync(curUserId, projectId);

            // Execute the Machine API, if it is enabled
            if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
            {
                string translationEngineId = await GetTranslationIdAsync(projectId);
                if (!string.IsNullOrWhiteSpace(translationEngineId))
                {
                    try
                    {
                        translationResultsDto = await _machineTranslationService.TranslateNAsync(
                            translationEngineId,
                            n,
                            segment,
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
                Engine engine = await GetInProcessEngineAsync(projectId, cancellationToken);
                IEnumerable<TranslationResult> translationResults = await _engineService.TranslateAsync(
                    engine.Id,
                    n,
                    segment
                );
                translationResultsDto = translationResults.Select(CreateDto).ToArray();
            }

            return translationResultsDto;
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

        private static EngineDto CreateDto(MachineApiTranslationEngine translationEngine) =>
            new EngineDto
            {
                Confidence = translationEngine.Confidence,
                IsShared = false,
                SourceLanguageTag = translationEngine.SourceLanguageTag,
                TargetLanguageTag = translationEngine.TargetLanguageTag,
                TrainedSegmentCount = translationEngine.CorpusSize,
            };

        private static EngineDto CreateDto(Engine engine) =>
            new EngineDto
            {
                Confidence = engine.Confidence,
                IsShared = false,
                SourceLanguageTag = engine.SourceLanguageTag,
                TargetLanguageTag = engine.TargetLanguageTag,
                TrainedSegmentCount = engine.TrainedSegmentCount,
            };

        private static PhraseDto CreateDto(Phrase phrase) =>
            new PhraseDto
            {
                SourceSegmentRange = CreateDto(phrase.SourceSegmentRange),
                TargetSegmentCut = phrase.TargetSegmentCut,
                Confidence = phrase.Confidence,
            };

        private static RangeDto CreateDto(Range<int> range) => new RangeDto { Start = range.Start, End = range.End };

        private static TranslationResultDto CreateDto(TranslationResult translationResult) =>
            new TranslationResultDto
            {
                Target = translationResult.TargetSegment.ToArray(),
                Confidences = translationResult.WordConfidences.Select(c => (float)c).ToArray(),
                Sources = translationResult.WordSources.ToArray(),
                Alignment = CreateDto(translationResult.Alignment),
                Phrases = translationResult.Phrases.Select(CreateDto).ToArray(),
            };

        private static WordGraphDto CreateDto(WordGraph wordGraph) =>
            new WordGraphDto
            {
                InitialStateScore = (float)wordGraph.InitialStateScore,
                FinalStates = wordGraph.FinalStates.ToArray(),
                Arcs = wordGraph.Arcs.Select(CreateDto).ToArray(),
            };

        private static WordGraphArcDto CreateDto(WordGraphArc arc) =>
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

        private static BuildDto UpdateDto(BuildDto buildDto, string projectId)
        {
            buildDto.Href = MachineApi.GetBuildHref(projectId, buildDto.Id);
            buildDto.Engine = new ResourceDto { Href = MachineApi.GetEngineHref(projectId), Id = projectId };

            // We use this special ID format so that the DTO ID can be an optional URL parameter
            buildDto.Id = $"{projectId}.{buildDto.Id}";
            return buildDto;
        }

        private static EngineDto UpdateDto(EngineDto engineDto, string projectId)
        {
            engineDto.Href = MachineApi.GetEngineHref(projectId);
            engineDto.Id = projectId;
            engineDto.Projects = new[]
            {
                new ResourceDto { Href = MachineApi.GetEngineHref(projectId), Id = projectId },
            };
            return engineDto;
        }

        private async Task EnsurePermissionAsync(string curUserId, string projectId)
        {
            // Load the project from the realtime service
            Attempt<SFProject> attempt = await _realtimeService.TryGetSnapshotAsync<SFProject>(projectId);
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

        private async Task<Engine> GetInProcessEngineAsync(string projectId, CancellationToken cancellationToken)
        {
            Engine? engine = await _engines.GetByLocatorAsync(EngineLocatorType.Project, projectId, cancellationToken);
            if (engine is null)
            {
                throw new DataNotFoundException("The engine does not exist.");
            }

            return engine;
        }

        private async Task<string> GetTranslationIdAsync(string projectId)
        {
            // Load the project secret, so we can get the translation engine ID
            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out SFProjectSecret projectSecret))
            {
                return string.Empty;
            }

            // Ensure we have a translation engine ID
            string? translationEngineId = projectSecret.MachineData?.TranslationEngineId;
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                return string.Empty;
            }

            return translationEngineId;
        }
    }
}
