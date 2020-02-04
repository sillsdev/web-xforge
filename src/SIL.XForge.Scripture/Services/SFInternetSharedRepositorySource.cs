using Paratext.Data.Repository;
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
        }
    }
}
