using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace SIL.XForge.Models
{
    [JsonObject(ItemNullValueHandling = NullValueHandling.Ignore)]
    public class Site
    {
        public string CurrentProjectId { get; set; }
        public List<string> Projects { get; set; } = new List<string>();
    }
}
