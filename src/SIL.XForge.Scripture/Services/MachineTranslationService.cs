using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using SIL.Machine.WebApi;
using SIL.ObjectModel;

namespace SIL.XForge.Scripture.Services
{
    public class MachineTranslationService : DisposableBase, IMachineTranslationService
    {
        private readonly ILogger<MachineTranslationService> _logger;
        private readonly HttpClient _machineClient;

        public MachineTranslationService(
            IHttpClientFactory httpClientFactory,
            ILogger<MachineTranslationService> logger
        )
        {
            _logger = logger;
            _machineClient = httpClientFactory.CreateClient(MachineProjectService.ClientName);
        }

        public async Task<WordGraphDto> GetWordGraphAsync(
            string translationEngineId,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        )
        {
            string requestUri = $"translation-engines/{translationEngineId}/get-word-graph";
            using var response = await _machineClient.PostAsJsonAsync(requestUri, segment, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            // Return the word graph
            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            return JsonConvert.DeserializeObject<WordGraphDto>(data)!;
        }

        public async Task TrainSegmentAsync(
            string translationEngineId,
            SegmentPairDto segmentPair,
            CancellationToken cancellationToken
        )
        {
            string requestUri = $"translation-engines/{translationEngineId}/train-segment";
            using var response = await _machineClient.PostAsJsonAsync(requestUri, segmentPair, cancellationToken);

            // No body is returned on success
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }
        }

        public async Task<TranslationResultDto> TranslateAsync(
            string translationEngineId,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        )
        {
            string requestUri = $"translation-engines/{translationEngineId}/translate";
            using var response = await _machineClient.PostAsJsonAsync(requestUri, segment, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            // Return the translation result
            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            return JsonConvert.DeserializeObject<TranslationResultDto>(data)!;
        }

        public async Task<TranslationResultDto[]> TranslateNAsync(
            string translationEngineId,
            int n,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        )
        {
            string requestUri = $"translation-engines/{translationEngineId}/translate/{n}";
            using var response = await _machineClient.PostAsJsonAsync(requestUri, segment, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            // Return the translation results
            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            return JsonConvert.DeserializeObject<TranslationResultDto[]>(data)!;
        }

        protected override void DisposeManagedResources()
        {
            _machineClient.Dispose();
        }
    }
}
