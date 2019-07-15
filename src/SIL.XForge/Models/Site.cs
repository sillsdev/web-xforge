using System;
using Newtonsoft.Json;

namespace SIL.XForge.Models
{
    [JsonObject(ItemNullValueHandling = NullValueHandling.Ignore)]
    public class Site
    {
        public string CurrentProjectId { get; set; }
        public DateTime? LastLogin { get; set; }
    }
}
