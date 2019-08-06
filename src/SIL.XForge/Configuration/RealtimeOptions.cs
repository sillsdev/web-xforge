using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Configuration
{
    public class RealtimeOptions
    {
        private static readonly DocConfig DefaultUserDocConfig = new DocConfig(RootDataTypes.Users)
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

        private static readonly DocConfig DefaultProjectDocConfig = new DocConfig(RootDataTypes.Projects)
        {
            ImmutableProperties =
            {
                PathTemplateConfig<Project>.Create(p => p.ShareEnabled),
                PathTemplateConfig<Project>.Create(p => p.ShareLevel),
                PathTemplateConfig<Project>.Create(p => p.UserRoles)
            }
        };

        public int Port { get; set; } = 5003;
        public DocConfig UserDoc { get; set; } = DefaultUserDocConfig;
        public DocConfig ProjectDoc { get; set; } = DefaultProjectDocConfig;
        public ProjectRoles ProjectRoles { get; set; }
        public IList<DocConfig> ProjectDataDocs { get; set; } = new List<DocConfig>();
    }
}
