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
    }
}
