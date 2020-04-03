using Paratext;
using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> A REST client using a JWT token to authenticate. </summary>
    public class JwtRESTClient : RESTClient
    {
        public JwtRESTClient(string baseUri, string applicationProductVersion, string jwtToken)
            : base(baseUri, applicationProductVersion)
        {
            this.JwtToken = jwtToken;
            ReflectionHelperLite.SetField(this, "authentication", null);
        }
    }
}
