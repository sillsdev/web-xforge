using Microsoft.AspNetCore.Builder;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class JsonRpcServiceCollectionExtensions
    {
        public static IServiceCollection AddXFJsonRpc(this IServiceCollection services)
        {
            services
                .AddJsonRpc()
                .WithOptions(options =>
                {
                    options.JsonSerializerSettings =
                        new JsonSerializerSettings {
                            ContractResolver = new CamelCasePropertyNamesContractResolver(),
                            NullValueHandling = NullValueHandling.Ignore
                        };
                });
            return services;
        }
    }
}
