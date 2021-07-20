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
        private static readonly JsonSerializer _serializer = new JsonSerializer
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore
        };

        /// <inheritdoc />
#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
        public async ValueTask<T> DeserializeAsync<T>(Stream stream, CancellationToken cancellationToken = default)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
        {
            using StreamReader sr = new StreamReader(stream, System.Text.Encoding.Default, true, 1024, true);
            using JsonTextReader reader = new JsonTextReader(sr);
            return _serializer.Deserialize<T>(reader);
        }

        /// <inheritdoc />
#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
        public async Task SerializeAsync<T>(Stream stream, T value, CancellationToken cancellationToken = default)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
        {
            using StreamWriter sw = new StreamWriter(stream, System.Text.Encoding.Default, 1024, true);
            using JsonWriter writer = new JsonTextWriter(sw);
            _serializer.Serialize(writer, value);
        }
    }
}
