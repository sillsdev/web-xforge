using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Provides objects implementing IInternetSharedRepositorySource.
    /// </summary>
    public class InternetSharedRepositorySourceProvider : IInternetSharedRepositorySourceProvider
    {
        private readonly IJwtTokenHelper _jwtTokenHelper;

        public InternetSharedRepositorySourceProvider(IJwtTokenHelper jwtTokenHelper)
        {
            _jwtTokenHelper = jwtTokenHelper;
        }

        public IInternetSharedRepositorySource GetSource(UserSecret userSecret, string sendReceiveServerUri,
            string registryServerUri, string applicationProductVersion)
        {
            if (userSecret == null || sendReceiveServerUri == null || registryServerUri == null
                || applicationProductVersion == null)
            {
                throw new ArgumentNullException();
            }

            JwtRESTClient jwtClient = GenerateParatextRegistryJwtClient(userSecret, registryServerUri,
                applicationProductVersion);
            IInternetSharedRepositorySource source =
                new JwtInternetSharedRepositorySource(userSecret.ParatextTokens.AccessToken,
                    jwtClient, sendReceiveServerUri);
            source.RefreshToken(userSecret.ParatextTokens.AccessToken);
            return source;
        }

        /// <summary>
        /// Initialize the Registry Server with a Jwt REST Client. Must be called for each unique user.
        /// </summary>
        private JwtRESTClient GenerateParatextRegistryJwtClient(UserSecret userSecret,
            string registryServerUri, string applicationProductVersion)
        {
            string jwtToken = _jwtTokenHelper.GetJwtTokenFromUserSecret(userSecret);

            string api = registryServerUri + "/api8/";
            return new JwtRESTClient(api, applicationProductVersion, jwtToken);
        }

    }
}
