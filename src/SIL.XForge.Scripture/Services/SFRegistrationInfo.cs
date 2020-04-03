using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> Implementation of <see cref="RegistrationInfo"/> for Scripture Forge. </summary>
    class SFRegistrationInfo : RegistrationInfo
    {
        private RegistrationData _registrationData;

        public SFRegistrationInfo(string username)
        {
            _registrationData = new RegistrationData { Name = username };
        }

        protected override RegistrationData GetRegistrationData()
        {
            return _registrationData;
        }

        protected override void HandleDeletedRegistration()
        {
        }

        protected override void HandleChangedRegistrationData(RegistrationData registrationData)
        {
            this._registrationData = registrationData;
        }

        protected override bool AcceptLicense(UserLicenseFlags licenseFlags)
        {
            return true;
        }
    }
}
