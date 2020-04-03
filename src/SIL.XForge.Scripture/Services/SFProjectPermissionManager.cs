using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Services
{
    public class MultiUserPermissionManager : ProjectPermissionManager
    {
        private readonly string _username;

        public MultiUserPermissionManager(MultiUserScrText scrText) : base(scrText)
        {
            _username = scrText.Username;
        }

        protected override string GetDefaultUser()
        {
            return _username;
        }
    }
}
