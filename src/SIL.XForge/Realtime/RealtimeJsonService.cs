using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Jering.Javascript.NodeJS;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace SIL.XForge.Realtime
{
    /// <summary>
    /// A Newtonsoft JSON implementation of <see cref="IJsonService"/>.
    /// This is used for compatibility since Newtonsoft is used elsewhere such as serializing for RPC commands.
    /// A key use is the property mappings in src\SIL.XForge\Realtime\Json0\Json0Op.cs
    /// </summary>
    public class RealtimeJsonService : IJsonService
    {
        private readonly IContractResolver _contractResolver = new DefaultContractResolver
        {
            NamingStrategy = new CamelCaseNamingStrategy(),
        };

        /// <inheritdoc />
        public ValueTask<T> DeserializeAsync<T>(Stream stream, CancellationToken cancellationToken = default)
        {
            using var sr = new StreamReader(stream, System.Text.Encoding.Default, true, 1024, false);
            using var reader = new JsonTextReader(sr) { CloseInput = true };
            var serializer = new JsonSerializer
            {
                ContractResolver = _contractResolver,
                NullValueHandling = NullValueHandling.Ignore,
                MetadataPropertyHandling = MetadataPropertyHandling.Ignore,
            };
            return ValueTask.FromResult(serializer.Deserialize<T>(reader));
        }

        /// <inheritdoc />
        public async Task SerializeAsync<T>(Stream stream, T value, CancellationToken cancellationToken = default)
        {
            await using var sw = new StreamWriter(stream, System.Text.Encoding.Default, 1024, true);
            using var writer = new JsonTextWriter(sw);
            var serializer = new JsonSerializer
            {
                ContractResolver = _contractResolver,
                NullValueHandling = NullValueHandling.Ignore,
                MetadataPropertyHandling = MetadataPropertyHandling.Ignore,
            };
            serializer.Serialize(writer, value);
        }
    }
}
