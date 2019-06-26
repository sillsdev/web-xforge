using System;
using System.Collections.Generic;

namespace SIL.XForge.Models
{

    public class UserEntity : Entity
    {
        public string Name { get; set; }
        public string Email { get; set; }
        public string Role { get; set; }
        public bool Active { get; set; }
        public string AvatarUrl { get; set; }
        public string ParatextId { get; set; }
        public Tokens ParatextTokens { get; set; }
        public bool IsNameConfirmed { get; set; }
        public string MobilePhone { get; set; }

        /// <summary>
        /// The allowable values for this property are defined in <see cref="ContactMethod" />.
        /// </summary>
        public string ContactMethod { get; set; }
        public DateTime Birthday { get; set; }
        public string Gender { get; set; }
        public string AuthId { get; set; }
        public string AuthType
        {
            get
            {
                if (AuthId == null || AuthId.LastIndexOf('|') < 0)
                    return "";

                string authIdType = AuthId.Substring(0, AuthId.LastIndexOf('|'));
                string authType = "";
                if (authIdType.Contains("paratext"))
                    authType = "paratext";
                else if (authIdType.Contains("google"))
                    authType = "google";
                else if (authIdType.Contains("auth0"))
                    authType = "account";
                return authType;
            }
        }
        public Dictionary<string, Site> Sites { get; set; } = new Dictionary<string, Site>();

        public Dictionary<string, object> ExtraElements { get; set; }
    }
}
