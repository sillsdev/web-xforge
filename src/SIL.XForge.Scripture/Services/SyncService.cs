using System.Threading.Tasks;
using Hangfire;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

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
            string sourceProjectId = null;
            using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (projectDoc.Data.SyncDisabled)
                {
                    throw new ForbiddenException();
                }

                sourceProjectId = projectDoc.Data.TranslateConfig.Source?.ParatextId;
                await projectDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));
            }

            if (!string.IsNullOrWhiteSpace(sourceProjectId))
            {
                // We need to sync the source first so that we can link the source texts and train the engine
                var parentId = _backgroundJobClient.Enqueue<ParatextSyncRunner>(r => r.RunAsync(sourceProjectId, curUserId, false));
                _backgroundJobClient.ContinueJobWith<ParatextSyncRunner>(parentId, r => r.RunAsync(projectId, curUserId, trainEngine));
            }
            else
            {
                _backgroundJobClient.Enqueue<ParatextSyncRunner>(r => r.RunAsync(projectId, curUserId, trainEngine));
            }
        }
    }
}
