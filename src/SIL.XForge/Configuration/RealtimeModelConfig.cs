using System.Collections.Generic;

namespace SIL.XForge.Configuration
{
    public class RealtimeModelConfig
    {
        public RealtimeModelConfig(int domain)
        {
            Domain = domain;
        }

        public int Domain { get; }

        public List<string> Path { get; set; } = new List<string>();
    }
}
