using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Services
{
    public class MachineBuildService : MachineServiceBase, IMachineBuildService
    {
        private readonly IExceptionHandler _exceptionHandler;

        public MachineBuildService(IExceptionHandler exceptionHandler, IHttpClientFactory httpClientFactory)
            : base(httpClientFactory)
        {
            _exceptionHandler = exceptionHandler;
        }

        public async Task CancelCurrentBuildAsync(string translationEngineId, CancellationToken cancellationToken)
        {
            ValidateId(translationEngineId);

            string requestUri = $"translation-engines/{translationEngineId}/current-build/cancel";
            using var response = await MachineClient.PostAsync(requestUri, content: null, cancellationToken);

            // A 200 HTTP status code is returned whether there is a job currently running or not
            await _exceptionHandler.EnsureSuccessStatusCode(response);
        }

        public async Task<BuildDto?> GetCurrentBuildAsync(
            string translationEngineId,
            long? minRevision,
            CancellationToken cancellationToken
        )
        {
            ValidateId(translationEngineId);

            string requestUri = $"translation-engines/{translationEngineId}/current-build";
            if (minRevision.HasValue)
            {
                requestUri += $"?minRevision={minRevision}";
            }

            using var response = await MachineClient.GetAsync(requestUri, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            // No body is returned on a 204 HTTP status code
            if (response.StatusCode == HttpStatusCode.NoContent)
            {
                return null;
            }

            // Return the build job information
            try
            {
                return await response.Content.ReadFromJsonAsync<BuildDto>(Options, cancellationToken);
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }

        public async Task<BuildDto> StartBuildAsync(string translationEngineId, CancellationToken cancellationToken)
        {
            ValidateId(translationEngineId);

            string requestUri = $"translation-engines/{translationEngineId}/builds";
            using var response = await MachineClient.PostAsync(requestUri, content: null, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            // Return the build job information
            try
            {
                return (await response.Content.ReadFromJsonAsync<BuildDto>(Options, cancellationToken))!;
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }
    }
}
