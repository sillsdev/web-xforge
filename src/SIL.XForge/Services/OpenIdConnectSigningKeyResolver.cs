using System.Diagnostics.CodeAnalysis;
using System.Linq;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace SIL.XForge.Services;

[ExcludeFromCodeCoverage(Justification = "This logic will only work with a live connection to an OpenId provider")]
public class OpenIdConnectSigningKeyResolver(string authority)
{
    private readonly OpenIdConnectConfiguration _openIdConfig = new ConfigurationManager<OpenIdConnectConfiguration>(
        $"{authority.TrimEnd('/')}/.well-known/openid-configuration",
        new OpenIdConnectConfigurationRetriever()
    )
        .GetConfigurationAsync()
        .GetAwaiter()
        .GetResult();

    public SecurityKey[] GetSigningKey(string kid) =>
        [_openIdConfig.JsonWebKeySet.GetSigningKeys().FirstOrDefault(t => t.KeyId == kid)];
}
