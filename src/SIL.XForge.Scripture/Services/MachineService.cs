using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using SIL.Machine.WebApi.Services;
using SIL.ObjectModel;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using MachineProject = SIL.Machine.WebApi.Models.Project;

#nullable enable

namespace SIL.XForge.Scripture.Services
{
    public class MachineService : DisposableBase, IMachineService
    {
        public const string ClientName = "machine_api";

        private readonly IEngineService _engineService;
        private readonly ILogger<MachineService> _logger;
        private readonly HttpClient _machineClient;
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly IRealtimeService _realtimeService;

        public MachineService(
            IEngineService engineService,
            IHttpClientFactory httpClientFactory,
            ILogger<MachineService> logger,
            IRepository<SFProjectSecret> projectSecrets,
            IRealtimeService realtimeService
        )
        {
            _engineService = engineService;
            _logger = logger;
            _projectSecrets = projectSecrets;
            _realtimeService = realtimeService;
            _machineClient = httpClientFactory.CreateClient(ClientName);
        }

        public async Task AddProjectAsync(string curUserId, string projectId)
        {
            using IConnection conn = await _realtimeService.ConnectAsync(curUserId);
            IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
            if (!projectDoc.IsLoaded)
            {
                throw new DataNotFoundException("The project does not exist.");
            }

            // Add the project to the in-memory Machine instance
            var machineProject = new MachineProject
            {
                Id = projectId,
                SourceLanguageTag = projectDoc.Data.TranslateConfig.Source.WritingSystem.Tag,
                TargetLanguageTag = projectDoc.Data.WritingSystem.Tag
            };
            await _engineService.AddProjectAsync(machineProject);

            // Add the project to the Machine API
            const string requestUri = "translation-engines";
            using var response = await _machineClient.PostAsJsonAsync(
                requestUri,
                new
                {
                    name = projectId,
                    sourceLanguageTag = machineProject.SourceLanguageTag,
                    targetLanguageTag = projectDoc.Data.WritingSystem.Tag,
                    type = "SmtTransfer",
                }
            );
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            string data = await response.Content.ReadAsStringAsync();
            _logger.LogInformation($"Response from {requestUri}: {data}");

            // Get the ID from the API response
            dynamic? translationEngine = JsonConvert.DeserializeObject<dynamic>(data);
            string? translationEngineId = translationEngine?.id;
            if (string.IsNullOrWhiteSpace(translationEngineId))
            {
                throw new ArgumentException("Translation Engine ID from the Machine API is missing.");
            }

            // Store the Translation Engine ID
            await _projectSecrets.UpdateAsync(
                projectId,
                u =>
                {
                    u.Set(p => p.TranslationEngineId, translationEngineId);
                }
            );
        }

        public async Task BuildProjectAsync(string curUserId, string projectId)
        {
            // Build the project with the in-memory Machine instance
            await _engineService.StartBuildByProjectIdAsync(projectId);

            // Load the target project secrets, so we can get the translation engine ID
            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new ArgumentException("The project secret cannot be found.");
            }

            // Build the project with the Machine API
            if (!string.IsNullOrWhiteSpace(projectSecret.TranslationEngineId))
            {
                string requestUri = $"translation-engines/{projectSecret.TranslationEngineId}/builds";
                using var response = await _machineClient.PostAsync(requestUri, null);

                // TODO: Use the response body?
                if (!response.IsSuccessStatusCode)
                {
                    throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
                }
            }
            else
            {
                _logger.LogInformation($"No Translation Engine Id specified for project {projectId}");
            }
        }

        public async Task RemoveProjectAsync(string curUserId, string projectId)
        {
            // Remove the project from the in-memory Machine instance
            await _engineService.RemoveProjectAsync(projectId);

            // Load the target project secrets, so we can get the translation engine ID
            if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out SFProjectSecret projectSecret))
            {
                throw new ArgumentException("The project secret cannot be found.");
            }

            // Remove the project from the Machine API
            if (!string.IsNullOrWhiteSpace(projectSecret.TranslationEngineId))
            {
                string requestUri = $"translation-engines/{projectSecret.TranslationEngineId}";
                using var response = await _machineClient.DeleteAsync(requestUri);

                // There is no response body - just check the status code
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogInformation(
                        $"Translation engine {projectSecret.TranslationEngineId} for project {projectId} could not be deleted."
                    );
                }
            }
            else
            {
                _logger.LogInformation($"No Translation Engine Id specified for project {projectId}");
            }
        }

        protected override void DisposeManagedResources()
        {
            _machineClient.Dispose();
        }
    }
}
