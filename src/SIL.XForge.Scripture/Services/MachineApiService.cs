using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SIL.Machine.WebApi;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    public class MachineApiService : IMachineApiService
    {
        private readonly IMachineBuildService _machineBuildService;
        private readonly IMachineTranslationService _machineTranslationService;
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly IRealtimeService _realtimeService;

        public MachineApiService(
            IMachineBuildService machineBuildService,
            IMachineTranslationService machineTranslationService,
            IRepository<SFProjectSecret> projectSecrets,
            IRealtimeService realtimeService
        )
        {
            _machineBuildService = machineBuildService;
            _machineTranslationService = machineTranslationService;
            _projectSecrets = projectSecrets;
            _realtimeService = realtimeService;
        }

        public async Task<BuildDto?> GetBuildAsync(
            string curUserId,
            string projectId,
            long? minRevision,
            CancellationToken cancellationToken
        )
        {
            string translationEngineId = await GetTranslationIdAsync(curUserId, projectId);
            BuildDto? build = await _machineBuildService.GetCurrentBuildAsync(
                translationEngineId,
                minRevision,
                cancellationToken
            );

            // Modify the Build DTO to reference the project
            if (build is not null)
            {
                build = UpdateDto(build, projectId);
            }

            return build;
        }

        public async Task<EngineDto> GetEngineAsync(
            string curUserId,
            string projectId,
            CancellationToken cancellationToken
        )
        {
            string translationEngineId = await GetTranslationIdAsync(curUserId, projectId);
            var translationEngine = await _machineTranslationService.GetTranslationEngineAsync(
                translationEngineId,
                cancellationToken
            );
            return new EngineDto
            {
                Confidence = translationEngine.Confidence,
                Href = MachineApi.GetEngineHref(projectId),
                Id = projectId,
                IsShared = false,
                Projects = new[]
                {
                    new ResourceDto { Href = MachineApi.GetEngineHref(projectId), Id = projectId }
                },
                SourceLanguageTag = translationEngine.SourceLanguageTag,
                TargetLanguageTag = translationEngine.TargetLanguageTag,
                TrainedSegmentCount = translationEngine.CorpusSize,
            };
        }

        public async Task<WordGraphDto> GetWordGraphAsync(
            string curUserId,
            string projectId,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        )
        {
            string translationEngineId = await GetTranslationIdAsync(curUserId, projectId);
            return await _machineTranslationService.GetWordGraphAsync(translationEngineId, segment, cancellationToken);
        }

        public async Task<BuildDto> StartBuildAsync(
            string curUserId,
            string projectId,
            CancellationToken cancellationToken
        )
        {
            string translationEngineId = await GetTranslationIdAsync(curUserId, projectId);
            BuildDto build = await _machineBuildService.StartBuildAsync(translationEngineId, cancellationToken);
            return UpdateDto(build, projectId);
        }

        public async Task TrainSegmentAsync(
            string curUserId,
            string projectId,
            SegmentPairDto segmentPair,
            CancellationToken cancellationToken
        )
        {
            string translationEngineId = await GetTranslationIdAsync(curUserId, projectId);
            await _machineTranslationService.TrainSegmentAsync(translationEngineId, segmentPair, cancellationToken);
        }

        private static BuildDto UpdateDto(BuildDto build, string projectId)
        {
            build.Href = MachineApi.GetBuildHref(projectId);
            build.Id = projectId;
            build.Engine = new ResourceDto { Href = MachineApi.GetEngineHref(projectId), Id = projectId };
            return build;
        }

        private async Task<string> GetTranslationIdAsync(string curUserId, string projectId)
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

            // Load the project secret, so we can get the translation engine ID
            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new DataNotFoundException("The project secret cannot be found.");
            }

            // Ensure we have a translation engine ID
            string? translationEngineId = projectSecret.MachineData?.TranslationEngineId;
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                throw new DataNotFoundException("The translation engine is not configured");
            }

            return translationEngineId;
        }
    }
}
