using System;
using Paratext;
using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> A REST client using a JWT token to authenticate. </summary>
    public class JwtRESTClient : RESTClient, ISFRESTClient
    {
        public JwtRESTClient(string baseUri, string applicationProductVersion, string jwtToken)
            : base(baseUri, applicationProductVersion)
        {
            this.JwtToken = jwtToken;
            ReflectionHelperLite.SetField(this, "authentication", null);
        }

        /// <inheritdoc />
        public string Head(CgiCallOptions options, string cgiCall, params string[] queryvars)
        {
            if (queryvars == null)
            {
                queryvars = Array.Empty<string>();
            }

            if (cgiCall == null)
            {
                cgiCall = string.Empty;
            }

            return ReflectionHelperLite.GetResult(this, "GetInternal", options, cgiCall, "HEAD", queryvars) as string;
        }
    }
}
