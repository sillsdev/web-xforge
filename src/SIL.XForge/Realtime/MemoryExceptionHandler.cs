using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;

namespace SIL.XForge.Realtime;

public class MemoryExceptionHandler : IExceptionHandler
{
    public void ReportException(Exception exception) { }

    public async Task EnsureSuccessStatusCode(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                await ExceptionHandler.CreateHttpRequestErrorMessage(response),
                null,
                response.StatusCode
            );
        }
    }

    public void ReportExceptions(IApplicationBuilder app) { }

    public void RecordEndpointInfoForException(Dictionary<string, string> metadata) { }

    public void RecordUserIdForException(string userId) { }
}
