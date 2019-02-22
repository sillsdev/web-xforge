using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Transcriber.Models
{
    public class TranscriberProjectRoles : ProjectRoles
    {
        public const string Administrator = "administrator";
        public const string User = "user";

        public static TranscriberProjectRoles Instance { get; } = new TranscriberProjectRoles();

        private TranscriberProjectRoles()
        {
            var userRights = new HashSet<Right>
            {
                // Fill in rights here
            };
            Rights[User] = userRights;

            var administratorRights = new HashSet<Right>(userRights)
            {
                // Fill in rights here
            };
            Rights[Administrator] = administratorRights;
        }
    }
}
