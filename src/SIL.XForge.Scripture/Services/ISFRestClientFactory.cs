using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// The Scripture Forge Rest Client Factory Interface.
/// </summary>
public interface ISFRestClientFactory
{
    /// <summary>
    /// Creates the rest client.
    /// </summary>
    /// <param name="baseUri">The base URI.</param>
    /// <param name="userSecret">The user secret.</param>
    /// <returns>The rest client.</returns>
    ISFRestClient Create(string baseUri, UserSecret userSecret);
}
