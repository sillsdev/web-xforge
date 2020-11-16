using Paratext.Data;
using static Paratext.Data.RESTClient;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// The Scripture Forge implementation of <see cref="IRESTClient" />.
    /// </summary>
    /// <seealso cref="Paratext.Data.IRESTClient" />
    public interface ISFRestClient : IRESTClient
    {
        /// <summary>
        /// Encode a HEAD cgi call with query vars.
        /// </summary>
        /// <param name="cgiCall">The CGI URL path (to be appended to BaseUri)
        /// Do not include ? or query variable pairs</param>
        /// <param name="queryvars">An even number of unencoded strings, paired
        /// like so: "varname1", "value1", "varname2", "val2"</param>
        /// <returns>
        /// The web response as a string.
        /// </returns>
        /// <remarks>
        /// A default implementation is included for convenience.
        /// </remarks>
        public string Head(string cgiCall, params string[] queryvars)
        {
            return Head(new CgiCallOptions(), cgiCall, queryvars);
        }

        /// <summary>
        /// Encode a HEAD cgi call with query vars.
        /// </summary>
        /// <param name="options">The CGI Call options.</param>
        /// <param name="cgiCall">The CGI URL path (to be appended to BaseUri)
        /// Do not include ? or query variable pairs</param>
        /// <param name="queryvars">An even number of unencoded strings, paired
        /// like so: "varname1", "value1", "varname2", "val2"</param>
        /// <returns>
        /// The web response as a string.
        /// </returns>
        public string Head(CgiCallOptions options, string cgiCall, params string[] queryvars);
    }
}
