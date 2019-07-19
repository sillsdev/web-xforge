using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Configuration
{
    public class RealtimeOptions
    {
        private static readonly RealtimeDocConfig DefaultUserDocConfig = new RealtimeDocConfig(RootDataTypes.Users)
        {
            ImmutableProperties =
            {
                PathTemplateConfig<User>.Create(u => u.AuthId),
                PathTemplateConfig<User>.Create(u => u.ParatextId),
                PathTemplateConfig<User>.Create(u => u.Role),
                PathTemplateConfig<User>.Create(u => u.AvatarUrl),
                PathTemplateConfig<User>.Create(u => u.Email),
                PathTemplateConfig<User>.Create(u => u.Sites, false),
                PathTemplateConfig<User>.Create(u => u.Sites["*"], false),
                PathTemplateConfig<User>.Create(u => u.Sites["*"].LastLogin),
                PathTemplateConfig<User>.Create(u => u.Sites["*"].Projects)
            }
        };

        private static readonly RealtimeDocConfig DefaultProjectDocConfig = new RealtimeDocConfig(
            RootDataTypes.Projects)
        {
            ImmutableProperties =
            {
                PathTemplateConfig<Project>.Create(p => p.UserRoles)
            }
        };

        public int Port { get; set; } = 5003;
        public RealtimeDocConfig UserDoc { get; set; } = DefaultUserDocConfig;
        public RealtimeDocConfig ProjectDoc { get; set; } = DefaultProjectDocConfig;
        public ProjectRoles ProjectRoles { get; set; }
        public IList<RealtimeDocConfig> ProjectDataDocs { get; set; } = new List<RealtimeDocConfig>();
    }
}
