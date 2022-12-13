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
    /// <summary>
    /// Shared functionality and configuration for Machine Services that access the Machine API.
    /// </summary>
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

        /// <summary>
        /// Validates an identifier for passing via a URL segment to the Machine API.
        /// </summary>
        /// <param name="id">The identifier.</param>
        /// <exception cref="ArgumentException"></exception>
        /// <remarks>
        /// Calling this method on an ID string ensures that the ID can be included in a URL to a Machine API endpoint,
        /// without risk of URL injection. This identifier will usually be a 24 character MongoDB generated identifier.
        /// Length is not verified - the Machine API will return an error for an incorrect/missing ID.
        /// </remarks>
        protected void ValidateId(string id)
        {
            if (!Regex.IsMatch(id, "^[a-zA-Z0-9]+$"))
            {
                throw new ArgumentException($"Invalid Identifier: {id}");
            }
        }
    }
}
