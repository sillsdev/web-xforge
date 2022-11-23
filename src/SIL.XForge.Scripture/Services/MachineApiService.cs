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
        private readonly IMachineTranslationService _machineTranslationService;
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly IRealtimeService _realtimeService;

        public MachineApiService(
            IMachineTranslationService machineTranslationService,
            IRepository<SFProjectSecret> projectSecrets,
            IRealtimeService realtimeService
        )
        {
            _machineTranslationService = machineTranslationService;
            _projectSecrets = projectSecrets;
            _realtimeService = realtimeService;
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
