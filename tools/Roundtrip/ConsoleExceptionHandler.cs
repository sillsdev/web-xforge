using Microsoft.AspNetCore.Builder;
using SIL.XForge;

namespace Roundtrip;

internal class ConsoleExceptionHandler : IExceptionHandler
{
    public void ReportException(Exception exception) => Console.WriteLine(exception);

    public Task EnsureSuccessStatusCode(HttpResponseMessage response) => throw new NotImplementedException();

    public void ReportExceptions(IApplicationBuilder app) => throw new NotImplementedException();

    public void RecordEndpointInfoForException(Dictionary<string, string> metadata) =>
        throw new NotImplementedException();

    public void RecordUserIdForException(string userId) => throw new NotImplementedException();
}
