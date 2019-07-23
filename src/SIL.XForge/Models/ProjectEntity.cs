using System.Collections.Generic;
using System.Linq;

namespace SIL.XForge.Models
{
    public abstract class ProjectEntity : Entity
    {
        public string ProjectName { get; set; }
        public InputSystem InputSystem { get; set; } = new InputSystem();

        public List<ProjectUserEntity> Users { get; set; } = new List<ProjectUserEntity>();

        public Dictionary<string, object> ExtraElements { get; set; }

        public abstract ProjectRoles Roles { get; }
        public bool ShareEnabled { get; set; } = true;
        public string ShareLevel { get; set; } = SharingLevel.Specific;
        /// <summary>Outstanding project access shares to specific people, represented by an email address and code pair.</summary>
        public Dictionary<string, string> ShareKeys { get; set; } = new Dictionary<string, string>();


        public bool TryGetRole(string userId, out string role)
        {
            role = Users.FirstOrDefault(u => u.UserRef == userId)?.Role;
            return role != null;
        }

        public bool HasRight(string userId, Right right)
        {
            if (TryGetRole(userId, out string role))
                return Roles.Rights[role].Contains(right);
            return false;
        }
    }
}
