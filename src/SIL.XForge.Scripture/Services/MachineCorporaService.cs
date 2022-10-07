#nullable enable

using Microsoft.Extensions.Logging;
using SIL.ObjectModel;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace SIL.XForge.Scripture.Services
{
    public class MachineCorporaService : DisposableBase, IMachineCorporaService
    {
        private readonly ILogger<MachineProjectService> _logger;
        private readonly HttpClient _machineClient;

        public MachineCorporaService(IHttpClientFactory httpClientFactory, ILogger<MachineProjectService> logger)
        {
            _logger = logger;
            _machineClient = httpClientFactory.CreateClient(MachineProjectService.ClientName);
        }

        public async Task<string> AddCorporaAsync(string name)
        {
            // Add the corpora to the Machine API
            const string requestUri = "corpora";
            using var response = await _machineClient.PostAsJsonAsync(
                requestUri,
                new { name, format = "Text", type = "Text", }
            );
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            string data = await response.Content.ReadAsStringAsync();
            _logger.LogInformation($"Response from {requestUri}: {data}");

            // Get the ID from the API response
            dynamic? corpora = JsonConvert.DeserializeObject<dynamic>(data);
            return corpora?.id ?? string.Empty;
        }

        protected override void DisposeManagedResources()
        {
            _machineClient.Dispose();
        }
    }
}
