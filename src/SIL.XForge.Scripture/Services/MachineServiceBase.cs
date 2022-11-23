using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using SIL.ObjectModel;

namespace SIL.XForge.Scripture.Services
{
    public abstract class MachineServiceBase : DisposableBase
    {
        public const string ClientName = "machine_api";

        protected HttpClient MachineClient { get; }
        protected JsonSerializerOptions Options { get; }

        protected MachineServiceBase(IHttpClientFactory httpClientFactory)
        {
            MachineClient = httpClientFactory.CreateClient(ClientName);
            Options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            Options.Converters.Add(new JsonStringEnumConverter());
        }

        protected static async Task<T> ReadAnonymousObjectFromJsonAsync<T>(
            HttpResponseMessage response,
            T _,
            JsonSerializerOptions options,
            CancellationToken cancellationToken
        ) => await response.Content.ReadFromJsonAsync<T>(options, cancellationToken);

        protected override void DisposeManagedResources()
        {
            MachineClient.Dispose();
        }

        protected void ValidateId(string id)
        {
            if (!Regex.IsMatch(id, "^[a-zA-Z0-9]+$"))
            {
                throw new ArgumentException($"Invalid Identifier: {id}");
            }
        }
    }
}
