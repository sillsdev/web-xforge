using System;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides objects implementing IInternetSharedRepositorySource.
/// </summary>
public class InternetSharedRepositorySourceProvider : IInternetSharedRepositorySourceProvider
{
    private readonly IJwtTokenHelper _jwtTokenHelper;
    private readonly IOptions<SiteOptions> _siteOptions;
    private readonly IHgWrapper _hgWrapper;
    private readonly ILogger<InternetSharedRepositorySourceProvider> _logger;

    public InternetSharedRepositorySourceProvider(
        IJwtTokenHelper jwtTokenHelper,
        IOptions<SiteOptions> siteOptions,
        IHgWrapper hgWrapper,
        ILogger<InternetSharedRepositorySourceProvider> logger
    )
    {
        _jwtTokenHelper = jwtTokenHelper;
        _siteOptions = siteOptions;
        _hgWrapper = hgWrapper;
        _logger = logger;
    }

    public IInternetSharedRepositorySource GetSource(
        UserSecret userSecret,
        string sendReceiveServerUri,
        string registryServerUri
    )
    {
        if (userSecret == null || string.IsNullOrEmpty(sendReceiveServerUri) || string.IsNullOrEmpty(registryServerUri))
        {
            throw new ArgumentException();
        }

        string ptUsername = _jwtTokenHelper.GetParatextUsername(userSecret);
        if (string.IsNullOrEmpty(ptUsername))
        {
            throw new Exception($"Failed to get a PT username for SF user id {userSecret.Id}.");
        }
        var ptUser = new SFParatextUser(ptUsername);
        JwtRestClient jwtClient = GenerateParatextRegistryJwtClient(userSecret, registryServerUri);
        IInternetSharedRepositorySource source = new JwtInternetSharedRepositorySource(
            userSecret.ParatextTokens.AccessToken,
            jwtClient,
            _hgWrapper,
            ptUser,
            sendReceiveServerUri,
            _logger
        );
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
