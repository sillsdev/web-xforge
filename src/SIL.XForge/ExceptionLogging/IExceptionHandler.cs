using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;

namespace SIL.XForge;

public interface IExceptionHandler
{
    void ReportException(Exception exception);

    Task EnsureSuccessStatusCode(HttpResponseMessage response);

    void ReportExceptions(IApplicationBuilder app);

    void RecordEndpointInfoForException(Dictionary<string, string> metadata);

    void RecordUserIdForException(string userId);
}
