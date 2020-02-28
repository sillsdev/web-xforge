using Paratext.Data;
using Paratext.Data.Repository;
using SIL.Reflection;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    public class SFInternetSharedRepositorySource : InternetSharedRepositorySource
    {
        private const string DevUrl = "https://archives-dev.paratext.org/send_receive_server/api80/";
        private const string ProdUrl = "https://archives.paratext.org/send_receive_server/api80/";

        public SFInternetSharedRepositorySource(bool useDevServer, UserSecret userSecret)
            : base(useDevServer ? DevUrl : ProdUrl)
        {
            // TODO: this won't work, because authentication is already set in the base constructor
            client.JwtToken = userSecret.ParatextTokens.AccessToken;

            // RESTClient only uses the jwtToken if authentication is null;
            ReflectionHelper.SetField(client, "authentication", null);
        }
    }

    class JwtInternetSharedRepositorySource : InternetSharedRepositorySource
    {
        public JwtInternetSharedRepositorySource(string jwtToken)
        {
            client.JwtToken = jwtToken;
            // RESTClient only uses the jwtToken if authentication is null;
            ReflectionHelper.SetField(client, "authentication", null);
        }
    }

    class JwtRESTClient : RESTClient
    {
        public JwtRESTClient(string baseUri, string applicationProductVersion, string jwtToken) : base(baseUri, applicationProductVersion)
        {
            this.JwtToken = jwtToken;
            ReflectionHelper.SetField(this, "authentication", null);
        }
    }
}
