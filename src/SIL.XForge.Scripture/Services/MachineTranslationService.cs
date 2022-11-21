using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Services
{
    public class MachineTranslationService : MachineServiceBase, IMachineTranslationService
    {
        private readonly IExceptionHandler _exceptionHandler;

        public MachineTranslationService(IExceptionHandler exceptionHandler, IHttpClientFactory httpClientFactory)
            : base(httpClientFactory)
        {
            _exceptionHandler = exceptionHandler;
        }

        public async Task<WordGraphDto> GetWordGraphAsync(
            string translationEngineId,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        )
        {
            ValidateId(translationEngineId);

            string requestUri = $"translation-engines/{translationEngineId}/get-word-graph";
            using var response = await MachineClient.PostAsJsonAsync(requestUri, segment, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            // Return the word graph
            try
            {
                return (await response.Content.ReadFromJsonAsync<WordGraphDto>(Options, cancellationToken))!;
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }

        public async Task TrainSegmentAsync(
            string translationEngineId,
            SegmentPairDto segmentPair,
            CancellationToken cancellationToken
        )
        {
            ValidateId(translationEngineId);

            string requestUri = $"translation-engines/{translationEngineId}/train-segment";
            using var response = await MachineClient.PostAsJsonAsync(requestUri, segmentPair, cancellationToken);

            // No body is returned on success
            await _exceptionHandler.EnsureSuccessStatusCode(response);
        }

        public async Task<TranslationResultDto> TranslateAsync(
            string translationEngineId,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        )
        {
            ValidateId(translationEngineId);

            string requestUri = $"translation-engines/{translationEngineId}/translate";
            using var response = await MachineClient.PostAsJsonAsync(requestUri, segment, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            // Return the translation result
            try
            {
                return (await response.Content.ReadFromJsonAsync<TranslationResultDto>(Options, cancellationToken))!;
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }

        public async Task<TranslationResultDto[]> TranslateNAsync(
            string translationEngineId,
            int n,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        )
        {
            ValidateId(translationEngineId);

            string requestUri = $"translation-engines/{translationEngineId}/translate/{n}";
            using var response = await MachineClient.PostAsJsonAsync(requestUri, segment, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            // Return the translation results
            try
            {
                return (await response.Content.ReadFromJsonAsync<TranslationResultDto[]>(Options, cancellationToken))!;
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }
    }
}
