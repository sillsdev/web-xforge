using System.Threading.Tasks;
using Hangfire;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class SyncService : ISyncService
    {
        private readonly IBackgroundJobClient _backgroundJobClient;
        private readonly IRealtimeService _realtimeService;

        public SyncService(IBackgroundJobClient backgroundJobClient, IRealtimeService realtimeService)
        {
            _backgroundJobClient = backgroundJobClient;
            _realtimeService = realtimeService;
        }

        public async Task SyncAsync(string projectId, string userId, bool trainEngine)
        {
            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                IDocument<SFProjectData> projectDataDoc = conn.Get<SFProjectData>(RootDataTypes.Projects, projectId);
                await projectDataDoc.FetchAsync();
                await projectDataDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));
            }
            _backgroundJobClient.Enqueue<ParatextSyncRunner>(r => r.RunAsync(projectId, userId, trainEngine));
        }
    }
}
