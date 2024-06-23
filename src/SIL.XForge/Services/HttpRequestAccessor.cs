using System;
using Microsoft.AspNetCore.Http;

namespace SIL.XForge.Services;

public class HttpRequestAccessor(IHttpContextAccessor httpContextAccessor) : IHttpRequestAccessor
{
    /// <summary>
    /// Gets the website root for URL operations.
    /// </summary>
    /// <returns>
    /// An absolute URL referencing the website's root address.
    /// </returns>
    public Uri SiteRoot
    {
        get
        {
            var uriBuilder = new UriBuilder(
                httpContextAccessor.HttpContext?.Request.Scheme,
                httpContextAccessor.HttpContext?.Request.Host.Host,
                httpContextAccessor.HttpContext?.Request.Host.Port ?? -1
            );
            if (uriBuilder.Uri.IsDefaultPort)
            {
                // -1 means to not specify the port in the URL
                uriBuilder.Port = -1;
            }

            return uriBuilder.Uri;
        }
    }
}
