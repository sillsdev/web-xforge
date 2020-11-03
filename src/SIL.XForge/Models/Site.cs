using System.Collections.Generic;
using Newtonsoft.Json;

namespace SIL.XForge.Models
{
    [JsonObject(ItemNullValueHandling = NullValueHandling.Ignore)]
    public class Site
    {
        public List<string> Projects { get; set; } = new List<string>();
        public List<string> Resources { get; set; } = new List<string>();
    }
}
