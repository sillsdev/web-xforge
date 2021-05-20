using System.Collections.Generic;
using System.Threading;
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
        private readonly Dictionary<string, string> _jobIdsByProjectId = new Dictionary<string, string>();
        private readonly Dictionary<string, string> _sourceJobIdsByProjectId = new Dictionary<string, string>();

        public SyncService(
            IBackgroundJobClient backgroundJobClient,
            IRealtimeService realtimeService)
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

                sourceProjectId = projectDoc.Data.TranslateConfig.Source?.ProjectRef;
                await projectDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));

                // See if we can sync the source project
                if (!string.IsNullOrWhiteSpace(sourceProjectId))
                {
                    IDocument<SFProject> sourceProjectDoc = await conn.FetchAsync<SFProject>(sourceProjectId);
                    if (!sourceProjectDoc.IsLoaded || sourceProjectDoc.Data.SyncDisabled)
                    {
                        sourceProjectId = null;
                    }
                    else
                    {
                        await sourceProjectDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));
                    }
                }
            }

            if (!string.IsNullOrWhiteSpace(sourceProjectId))
            {
                // We need to sync the source first so that we can link the source texts and train the engine
                string sourceJobId = _backgroundJobClient.Enqueue<ParatextSyncRunner>(
                    r => r.RunAsync(sourceProjectId, curUserId, false, CancellationToken.None));
                _sourceJobIdsByProjectId[projectId] = sourceJobId;
                _jobIdsByProjectId[projectId] = _backgroundJobClient.ContinueJobWith<ParatextSyncRunner>(sourceJobId,
                    r => r.RunAsync(projectId, curUserId, trainEngine, CancellationToken.None));
            }
            else
            {
                _jobIdsByProjectId[projectId] = _backgroundJobClient.Enqueue<ParatextSyncRunner>(
                    r => r.RunAsync(projectId, curUserId, trainEngine, CancellationToken.None));
            }
        }

        public async Task CancelSyncAsync(string curUserId, string projectId)
        {
            if (_sourceJobIdsByProjectId.TryGetValue(projectId, out string sourceJobId))
                _backgroundJobClient.Delete(sourceJobId);
            if (_jobIdsByProjectId.TryGetValue(projectId, out string jobId))
                _backgroundJobClient.Delete(jobId);

            using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (projectDoc.Data.SyncDisabled)
                {
                    throw new ForbiddenException();
                }
                if (projectDoc.Data.Sync.QueuedCount > 0)
                    await projectDoc.SubmitJson0OpAsync(op =>
                    {
                        op.Inc(pd => pd.Sync.QueuedCount, -1);
                        op.Unset(pd => pd.Sync.PercentCompleted);
                        op.Set(pd => pd.Sync.LastSyncSuccessful, false);
                    });
            }
        }
    }
}
