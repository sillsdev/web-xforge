using System;

namespace SIL.XForge.Services;

public interface IHttpRequestAccessor
{
    public Uri SiteRoot { get; }
}
