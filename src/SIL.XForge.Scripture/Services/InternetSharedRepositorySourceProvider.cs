using System;
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

        public InternetSharedRepositorySourceProvider(IJwtTokenHelper jwtTokenHelper)
        {
            _jwtTokenHelper = jwtTokenHelper;
        }

        public IInternetSharedRepositorySource GetSource(UserSecret userSecret, string sendReceiveServerUri,
            string registryServerUri, string applicationProductVersion)
        {
            if (userSecret == null || string.IsNullOrEmpty(sendReceiveServerUri)
                || string.IsNullOrEmpty(registryServerUri) || string.IsNullOrEmpty(applicationProductVersion))
            {
                throw new ArgumentException();
            }

            string ptUsername = _jwtTokenHelper.GetParatextUsername(userSecret);
            var ptUser = new SFParatextUser(ptUsername);
            JwtRestClient jwtClient = GenerateParatextRegistryJwtClient(userSecret, registryServerUri,
                applicationProductVersion);
            IInternetSharedRepositorySource source =
                new JwtInternetSharedRepositorySource(userSecret.ParatextTokens.AccessToken,
                    jwtClient, ptUser, sendReceiveServerUri);
            source.RefreshToken(userSecret.ParatextTokens.AccessToken);
            return source;
        }

        /// <summary>
        /// Initialize the Registry Server with a Jwt REST Client.
        /// </summary>
        private JwtRestClient GenerateParatextRegistryJwtClient(UserSecret userSecret,
            string registryServerUri, string applicationProductVersion)
        {
            string jwtToken = _jwtTokenHelper.GetJwtTokenFromUserSecret(userSecret);

            string api = registryServerUri + "/api8/";
            return new JwtRestClient(api, applicationProductVersion, jwtToken);
        }
    }
}
