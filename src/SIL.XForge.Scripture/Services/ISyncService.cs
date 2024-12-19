using System.Threading.Tasks;
using Autofac.Extras.DynamicProxy;
using SIL.XForge.EventMetrics;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[Intercept(typeof(EventMetricLogger))]
public interface ISyncService
{
    [LogEventMetric(
        EventScope.Sync,
        userId: "syncConfig.UserId",
        projectId: "syncConfig.ProjectId",
        captureReturnValue: true
    )]
    Task<string> SyncAsync(SyncConfig syncConfig);

    [LogEventMetric(EventScope.Sync, nameof(curUserId))]
    Task CancelSyncAsync(string curUserId, string projectId);
}
