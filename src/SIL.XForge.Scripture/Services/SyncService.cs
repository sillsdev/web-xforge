using System.Threading.Tasks;
using Hangfire;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class manages syncing SF with the Paratext web service APIs.
    /// </summary>
    public class SyncService : ISyncService
    {
        private readonly IBackgroundJobClient _backgroundJobClient;

        private readonly IRealtimeService _realtimeService;

        public SyncService(IBackgroundJobClient backgroundJobClient, IRealtimeService realtimeService)
        {
            _backgroundJobClient = backgroundJobClient;
            _realtimeService = realtimeService;
        }

        public async Task SyncAsync(string curUserId, string projectId, bool trainEngine)
        {
            using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                await projectDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));
            }
            _backgroundJobClient.Enqueue<ParatextSyncRunner>(r => r.RunAsync(projectId, curUserId, trainEngine));
        }
    }
}
