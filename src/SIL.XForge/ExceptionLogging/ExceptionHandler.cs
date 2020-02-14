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
                string error = await response.Content.ReadAsStringAsync();
                var exception = new HttpRequestException(
                    $"HTTP Request error, Code: {response.StatusCode}, Content: {error}");
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
