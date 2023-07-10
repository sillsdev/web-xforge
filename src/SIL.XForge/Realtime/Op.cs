using Newtonsoft.Json;

namespace SIL.XForge.Realtime;

/// <summary>
/// A partial implementation of the op class.
/// </summary>
/// <remarks>This corresponds to the "o_" tables in Mongo.</remarks>
public class Op
{
    [JsonProperty("m")]
    public OpMetadata Metadata { get; set; } = new OpMetadata();

    [JsonProperty("v")]
    public int Version { get; set; }
}
