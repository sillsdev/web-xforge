using System;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Provides objects implementing IInternetSharedRepositorySource.
    /// </summary>
    public class InternetSharedRepositorySourceProvider : IInternetSharedRepositorySourceProvider
    {
        private readonly IJwtTokenHelper _jwtTokenHelper;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IHgWrapper _hgWrapper;

        public InternetSharedRepositorySourceProvider(IJwtTokenHelper jwtTokenHelper, IOptions<SiteOptions> siteOptions,
            IHgWrapper hgWrapper)
        {
            _jwtTokenHelper = jwtTokenHelper;
            _siteOptions = siteOptions;
            _hgWrapper = hgWrapper;
        }

        public IInternetSharedRepositorySource GetSource(UserSecret userSecret, string sendReceiveServerUri,
            string registryServerUri)
        {
            if (userSecret == null || string.IsNullOrEmpty(sendReceiveServerUri)
                || string.IsNullOrEmpty(registryServerUri))
            {
                throw new ArgumentException();
            }

            string ptUsername = _jwtTokenHelper.GetParatextUsername(userSecret);
            var ptUser = new SFParatextUser(ptUsername);
            JwtRestClient jwtClient = GenerateParatextRegistryJwtClient(userSecret, registryServerUri);
            IInternetSharedRepositorySource source =
                new JwtInternetSharedRepositorySource(userSecret.ParatextTokens.AccessToken,
                    jwtClient, _hgWrapper, ptUser, sendReceiveServerUri);
            source.RefreshToken(userSecret.ParatextTokens.AccessToken);
            return source;
        }

        /// <summary>
        /// Initialize the Registry Server with a Jwt REST Client.
        /// </summary>
        private JwtRestClient GenerateParatextRegistryJwtClient(UserSecret userSecret, string registryServerUri)
        {
            string jwtToken = _jwtTokenHelper.GetJwtTokenFromUserSecret(userSecret);

            string api = registryServerUri + "/api8/";
            return new JwtRestClient(api, _siteOptions.Value.Name, jwtToken);
        }
    }
}
