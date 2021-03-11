using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
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
        private readonly IOptions<SiteOptions> _siteOptions;

        /// <summary>
        /// Initializes a new instance of the <see cref="SFDblRestClientFactory"/> class.
        /// </summary>
        /// <param name="jwtTokenHelper">The JWT token helper.</param>
        public SFDblRestClientFactory(IJwtTokenHelper jwtTokenHelper, IOptions<SiteOptions> siteOptions)
        {
            _jwtTokenHelper = jwtTokenHelper;
            _siteOptions = siteOptions;
        }

        /// <inheritdoc />
        public ISFRestClient Create(string baseUri, UserSecret userSecret)
        {
            string jwtToken = _jwtTokenHelper.GetJwtTokenFromUserSecret(userSecret);
            return new JwtRestClient(baseUri, _siteOptions.Value.Name, jwtToken);
        }
    }
}
