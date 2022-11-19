using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using SIL.ObjectModel;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class MachineBuildService : DisposableBase, IMachineBuildService
    {
        private readonly ILogger<MachineBuildService> _logger;
        private readonly HttpClient _machineClient;

        public MachineBuildService(IHttpClientFactory httpClientFactory, ILogger<MachineBuildService> logger)
        {
            _logger = logger;
            _machineClient = httpClientFactory.CreateClient(MachineProjectService.ClientName);
        }

        public async Task CancelCurrentBuildAsync(string translationEngineId, CancellationToken cancellationToken)
        {
            string requestUri = $"translation-engines/{translationEngineId}/current-build/cancel";
            using var response = await _machineClient.PostAsync(requestUri, content: null, cancellationToken);

            // A 200 is returned whether there is a job currently running or not
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }
        }

        public async Task<MachineBuildJob?> GetCurrentBuildAsync(
            string translationEngineId,
            long? minRevision,
            CancellationToken cancellationToken
        )
        {
            string requestUri = $"translation-engines/{translationEngineId}/current-build";
            if (minRevision.HasValue)
            {
                requestUri += $"?minRevision={minRevision}";
            }

            using var response = await _machineClient.GetAsync(requestUri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            // Return the build job information
            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            return JsonConvert.DeserializeObject<MachineBuildJob>(data);
        }

        public async Task<MachineBuildJob> StartBuildAsync(
            string translationEngineId,
            CancellationToken cancellationToken
        )
        {
            string requestUri = $"translation-engines/{translationEngineId}/builds";
            using var response = await _machineClient.PostAsync(requestUri, content: null, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            // Return the build job information
            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            return JsonConvert.DeserializeObject<MachineBuildJob>(data) ?? new MachineBuildJob();
        }

        protected override void DisposeManagedResources()
        {
            _machineClient.Dispose();
        }
    }
}
