using Paratext;
using Paratext.Data;

namespace SIL.XForge.Scripture.Services;

/// <summary> A REST client using a JWT token to authenticate. </summary>
public class JwtRestClient : RESTClient, ISFRestClient
{
    public JwtRestClient(string baseUri, string applicationName, string jwtToken)
        : base(baseUri, null)
    {
        this.JwtToken = jwtToken;
        ReflectionHelperLite.SetField(this, "authentication", null);
        OverrideApplicationAgent = applicationName.Replace(" ", "") + "/" + Product.Version;
    }
}
