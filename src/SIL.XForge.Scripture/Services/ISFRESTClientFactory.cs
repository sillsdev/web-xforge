using Paratext.Data;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// The Scripture Forge Rest Client Factory Interface.
    /// </summary>
    public interface ISFRESTClientFactory
    {
        /// <summary>
        /// Creates the rest client.
        /// </summary>
        /// <param name="baseUri">The base URI.</param>
        /// <param name="applicationProductVersion">The application product version.</param>
        /// <param name="userSecret">The user secret.</param>
        /// <returns>The rest client.</returns>
        IRESTClient Create(string baseUri, string applicationProductVersion, UserSecret userSecret);
    }
}
