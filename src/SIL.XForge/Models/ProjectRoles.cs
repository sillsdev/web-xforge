using System;
using System.Collections.Generic;

namespace SIL.XForge.Models
{
    public abstract class ProjectRoles
    {
        public const string None = "none";

        public ProjectRoles()
        {
            Rights = new Dictionary<string, ISet<Right>>();
        }

        public IDictionary<string, ISet<Right>> Rights { get; }

        public abstract string AdminRole { get; }

        protected static IEnumerable<Right> AllRights(int domain)
        {
            foreach (Operation operation in Enum.GetValues(typeof(Operation)))
                yield return new Right(domain, operation);
        }
    }
}
