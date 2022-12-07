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
        private static readonly JsonSerializer Serializer = new JsonSerializer
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
        };

        /// <inheritdoc />
        public ValueTask<T> DeserializeAsync<T>(Stream stream, CancellationToken cancellationToken = default)
        {
            using StreamReader sr = new StreamReader(stream, System.Text.Encoding.Default, true, 1024, true);
            using JsonTextReader reader = new JsonTextReader(sr);
            return ValueTask.FromResult(Serializer.Deserialize<T>(reader));
        }

        /// <inheritdoc />
        public async Task SerializeAsync<T>(Stream stream, T value, CancellationToken cancellationToken = default)
        {
            await using StreamWriter sw = new StreamWriter(stream, System.Text.Encoding.Default, 1024, true);
            using JsonWriter writer = new JsonTextWriter(sw);
            Serializer.Serialize(writer, value);
        }
    }
}
