using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public interface IParatextSyncRunner
{
    Task RunAsync(
        string projectId,
        IUserAccessor userAccessor,
        string syncMetricsId,
        bool trainEngine,
        CancellationToken token
    );
}
