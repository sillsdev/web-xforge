using System.Collections.Generic;
using Newtonsoft.Json;

namespace SIL.XForge.Models
{
    [JsonObject(ItemNullValueHandling = NullValueHandling.Ignore)]
    public class Json0Snapshot : IIdentifiable
    {
        [JsonIgnore]
        public string Id { get; set; }

        [JsonIgnore]
        public Dictionary<string, object> ExtraElements { get; set; }
    }
}
