using System.Collections.Generic;
using Paratext.Data;
using Paratext;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> An internet shared repository source using a JWT token to authenticate </summary>
    class JwtInternetSharedRepositorySource : InternetSharedRepositorySource, IInternetSharedRepositorySource
    {
        public void SetToken(string jwtToken)
        {
            client.JwtToken = jwtToken;
            // RESTClient only uses the jwtToken if authentication is null;
            ReflectionHelperLite.SetField(client, "authentication", null);
        }

        public InternetSharedRepositorySource AsInternetSharedRepositorySource()
        {
            return this;
        }
    }

    public interface IInternetSharedRepositorySource
    {
        IEnumerable<SharedRepository> GetRepositories();
        string[] Pull(string repository, SharedRepository pullRepo);
        void SetToken(string jwtToken);

        /// <summary>Access as a particular class.</summary>
        InternetSharedRepositorySource AsInternetSharedRepositorySource();
    }

    /// <summary> A REST client using a jwt token to authenticate </summary>
    class JwtRESTClient : RESTClient
    {
        public JwtRESTClient(string baseUri, string applicationProductVersion, string jwtToken) : base(baseUri, applicationProductVersion)
        {
            this.JwtToken = jwtToken;
            ReflectionHelperLite.SetField(this, "authentication", null);
        }
    }
}
