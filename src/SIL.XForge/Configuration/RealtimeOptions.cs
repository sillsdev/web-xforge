using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Utils;

namespace SIL.XForge.Configuration
{
    public class RealtimeOptions
    {
        private static readonly RealtimeDocConfig DefaultUserDocConfig = new RealtimeDocConfig(RootDataTypes.Users)
        {
            ImmutableProperties =
            {
                UserPath(u => u.AuthId),
                UserPath(u => u.ParatextId),
                UserPath(u => u.Role),
                UserPath(u => u.AvatarUrl),
                UserPath(u => u.Email)
            }
        };

        private static ObjectPath UserPath<TField>(Expression<Func<User, TField>> field)
        {
            return new ObjectPath(field);
        }

        public int Port { get; set; } = 5003;
        public RealtimeDocConfig UserDoc { get; set; } = DefaultUserDocConfig;
        public ProjectRoles ProjectRoles { get; set; }
        public IList<RealtimeDocConfig> ProjectDataDocs { get; set; } = new List<RealtimeDocConfig>();
    }
}
