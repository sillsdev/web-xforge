using Paratext.Data;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// The Scripture Forge Rest Client Factory.
    /// </summary>
    /// <seealso cref="SIL.XForge.Scripture.Services.ISFRESTClientFactory" />
    public class SFDBLRESTClientFactory : ISFRESTClientFactory
    {
        /// <summary>
        /// The JWT token helper.
        /// </summary>
        private readonly IJwtTokenHelper _jwtTokenHelper;

        /// <summary>
        /// Initializes a new instance of the <see cref="SFDBLRESTClientFactory"/> class.
        /// </summary>
        /// <param name="jwtTokenHelper">The JWT token helper.</param>
        public SFDBLRESTClientFactory(IJwtTokenHelper jwtTokenHelper)
        {
            this._jwtTokenHelper = jwtTokenHelper;
        }

        /// <inheritdoc />
        public IRESTClient Create(string baseUri, string applicationProductVersion, UserSecret userSecret)
        {
            string jwtToken = this._jwtTokenHelper.GetJwtTokenFromUserSecret(userSecret);
            return new JwtRESTClient(baseUri, applicationProductVersion, jwtToken);
        }
    }
}
