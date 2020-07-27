using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace SIL.XForge
{
    public class ExceptionHandler : IExceptionHandler
    {
        private readonly Bugsnag.IClient _bugsnag;

        public ExceptionHandler(Bugsnag.IClient client)
        {
            _bugsnag = client;
        }

        public void ReportException(Exception exception)
        {
            _bugsnag.Notify(exception);
        }

        public async Task EnsureSuccessStatusCode(HttpResponseMessage response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var exception = new HttpRequestException(string.Join("\n", new string[] {
                    "HTTP Request error:",
                    "Request (request content omitted for security reasons):",
                    response.RequestMessage.ToString(),
                    "Response:",
                    response.ToString(),
                    "Response content:",
                    await response.Content.ReadAsStringAsync()
                }).Replace("\n", "\n    "));
                ReportException(exception);
                throw exception;
            }
        }

        public void ReportExceptions(IApplicationBuilder app)
        {
            app.Run(async context =>
            {
                context.Response.StatusCode = 500;
                context.Response.ContentType = "text/plain";
                await context.Response.WriteAsync("500 Internal Server Error");

                var exceptionHandlerPathFeature = context.Features.Get<IExceptionHandlerPathFeature>();
                ReportException(exceptionHandlerPathFeature.Error);
            });
        }
    }
}
