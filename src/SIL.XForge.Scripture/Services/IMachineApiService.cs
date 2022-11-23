using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    using SIL.Machine.WebApi;
    using System.Threading;

    public interface IMachineApiService
    {
        Task<EngineDto> GetEngineAsync(string curUserId, string projectId, CancellationToken cancellationToken);
    }
}
