using System.Net.Http;
using System.Net;
using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public class MockHttpMessageHandler : HttpMessageHandler
    {
        private readonly string _response;
        private readonly HttpStatusCode _statusCode;

        public string? LastInput { get; private set; }
        public int NumberOfCalls { get; private set; }

        public MockHttpMessageHandler(string response, HttpStatusCode statusCode)
        {
            _response = response;
            _statusCode = statusCode;
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        )
        {
            NumberOfCalls++;
            if (request.Content is not null)
            {
                LastInput = await request.Content.ReadAsStringAsync(cancellationToken);
            }
            return new HttpResponseMessage
            {
                StatusCode = _statusCode,
                Content = new StringContent(_response),
                RequestMessage = request,
            };
        }
    }
}
