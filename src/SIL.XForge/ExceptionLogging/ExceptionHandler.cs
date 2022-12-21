using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace SIL.XForge;

public class ExceptionHandler : IExceptionHandler
{
    private readonly Bugsnag.IClient _bugsnag;

    public static async Task<string> CreateHttpRequestErrorMessage(HttpResponseMessage response)
    {
        string responseContent = string.Join("\n", (await response.Content.ReadAsStringAsync()).Split('\n').Take(10));
        return string.Join(
                "\n",
                new string[]
                {
                    "HTTP Request error:",
                    $"{response.RequestMessage.Method} {response.RequestMessage.RequestUri}",
                    "Response:",
                    response.ToString(),
                    "Response content begins with:",
                    responseContent
                }
            )
            .Replace("\n", "\n    ");
    }

    public ExceptionHandler(Bugsnag.IClient client) => _bugsnag = client;

    public void ReportException(Exception exception) => _bugsnag.Notify(exception);

    public async Task EnsureSuccessStatusCode(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            var exception = new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            ReportException(exception);
            throw exception;
        }
    }

    public void ReportExceptions(IApplicationBuilder app) =>
        app.Run(async context =>
        {
            context.Response.StatusCode = 500;
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("500 Internal Server Error");

            var exceptionHandlerPathFeature = context.Features.Get<IExceptionHandlerPathFeature>();
            ReportException(exceptionHandlerPathFeature.Error);
        });

    public void RecordEndpointInfoForException(Dictionary<string, string> metadata) =>
        _bugsnag.BeforeNotify(report => report.Event.Metadata.Add("endpoint", metadata));

    public void RecordUserIdForException(string userId)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            _bugsnag.BeforeNotify(report => report.Event.User = new Bugsnag.Payload.User { Id = userId, });
        }
    }
}
