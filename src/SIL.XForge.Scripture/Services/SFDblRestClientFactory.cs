using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// The Scripture Forge Rest Client Factory.
    /// </summary>
    /// <seealso cref="SIL.XForge.Scripture.Services.ISFRestClientFactory" />
    public class SFDblRestClientFactory : ISFRestClientFactory
    {
        /// <summary>
        /// The JWT token helper.
        /// </summary>
        private readonly IJwtTokenHelper _jwtTokenHelper;

        /// <summary>
        /// Initializes a new instance of the <see cref="SFDblRestClientFactory"/> class.
        /// </summary>
        /// <param name="jwtTokenHelper">The JWT token helper.</param>
        public SFDblRestClientFactory(IJwtTokenHelper jwtTokenHelper)
        {
            this._jwtTokenHelper = jwtTokenHelper;
        }

        /// <inheritdoc />
        public ISFRestClient Create(string baseUri, string applicationProductVersion, UserSecret userSecret)
        {
            string jwtToken = this._jwtTokenHelper.GetJwtTokenFromUserSecret(userSecret);
            return new JwtRestClient(baseUri, applicationProductVersion, jwtToken);
        }
    }
}
