using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Hangfire.States;
using SIL.XForge.DataAccess;
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
        private readonly IRepository<SFProjectSecret> _projectSecrets;
        private readonly IRealtimeService _realtimeService;

        public SyncService(
            IBackgroundJobClient backgroundJobClient,
            IRepository<SFProjectSecret> projectSecrets,
            IRealtimeService realtimeService)
        {
            _backgroundJobClient = backgroundJobClient;
            _projectSecrets = projectSecrets;
            _realtimeService = realtimeService;
        }

        public async Task SyncAsync(string curUserId, string projectId, bool trainEngine)
        {
            using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
            {
                // Load the project document
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (projectDoc.Data.SyncDisabled)
                {
                    throw new ForbiddenException();
                }

                // Load the target project secrets, so we can store the job id
                if (!(await _projectSecrets.TryGetAsync(projectId)).TryResult(out SFProjectSecret projectSecret))
                {
                    throw new ArgumentException("The target project secret cannot be found.");
                }

                // See if we can sync the source project
                string sourceProjectId = projectDoc.Data.TranslateConfig.Source?.ProjectRef;
                if (projectDoc.Data.TranslateConfig.TranslationSuggestionsEnabled
                    && !string.IsNullOrWhiteSpace(sourceProjectId))
                {
                    IDocument<SFProject> sourceProjectDoc = await conn.FetchAsync<SFProject>(sourceProjectId);
                    if (!sourceProjectDoc.IsLoaded || sourceProjectDoc.Data.SyncDisabled)
                    {
                        sourceProjectId = null;
                    }
                    else
                    {
                        // Load the source project secrets, so we can store the job id
                        if (!(await _projectSecrets.TryGetAsync(sourceProjectId)).TryResult(out SFProjectSecret sourceProjectSecret))
                        {
                            throw new ArgumentException("The source project secret cannot be found.");
                        }

                        // Schedule the sync for 5 minutes to give us enough time to update the project's sync object
                        // We do this because there is no "draft" status in hangfire - this is close enough
                        // After we do that, we will enqueue the job. We do it this way because we don't want to start
                        // the job unless the queued count and job ids have been incremented appropriately.
                        // We need to sync the source first so that we can link the source texts and train the engine.
                        string sourceJobId = _backgroundJobClient.Schedule<ParatextSyncRunner>(
                            r => r.RunAsync(sourceProjectId, curUserId, false, CancellationToken.None),
                            TimeSpan.FromMinutes(5));
                        string targetJobId = _backgroundJobClient.ContinueJobWith<ParatextSyncRunner>(sourceJobId,
                            r => r.RunAsync(projectId, curUserId, trainEngine, CancellationToken.None), null,
                            JobContinuationOptions.OnAnyFinishedState);
                        try
                        {
                            await sourceProjectDoc.SubmitJson0OpAsync(op =>
                            {
                                op.Inc(pd => pd.Sync.QueuedCount);
                            });
                            await projectDoc.SubmitJson0OpAsync(op =>
                            {
                                op.Inc(pd => pd.Sync.QueuedCount);
                            });

                            // Store the source job id so we can cancel the job later if needed
                            await _projectSecrets.UpdateAsync(sourceProjectSecret.Id, u =>
                            {
                                u.Add(p => p.JobIds, sourceJobId);
                            });

                            // Store the target job id so we can cancel the job later if needed
                            await _projectSecrets.UpdateAsync(projectSecret.Id, u =>
                            {
                                u.Add(p => p.JobIds, targetJobId);
                            });

                            _backgroundJobClient.ChangeState(sourceJobId, new EnqueuedState());
                        }
                        catch (Exception)
                        {
                            // Delete the jobs on error, and notify the user
                            _backgroundJobClient.Delete(targetJobId);
                            _backgroundJobClient.Delete(sourceJobId);
                            throw;
                        }

                        // Exit so we don't queue the target again, in the following block
                        return;
                    }
                }

                // Sync the target project only, as it does not have a source, or the source cannot be synced
                // See the comments in the block above regarding scheduling for rationale on the process
                string jobId = _backgroundJobClient.Schedule<ParatextSyncRunner>(
                    r => r.RunAsync(projectId, curUserId, trainEngine, CancellationToken.None),
                    TimeSpan.FromMinutes(5));
                try
                {
                    await projectDoc.SubmitJson0OpAsync(op =>
                    {
                        op.Inc(pd => pd.Sync.QueuedCount);
                    });

                    // Store the job id so we can cancel the job later if needed
                    await _projectSecrets.UpdateAsync(projectSecret.Id, u =>
                    {
                        u.Add(p => p.JobIds, jobId);
                    });

                    _backgroundJobClient.ChangeState(jobId, new EnqueuedState());
                }
                catch (Exception)
                {
                    // Delete the job on error, and notify the user
                    _backgroundJobClient.Delete(jobId);
                    throw;
                }
            }
        }

        public async Task CancelSyncAsync(string curUserId, string projectId)
        {
            using (IConnection conn = await _realtimeService.ConnectAsync(curUserId))
            {
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
                if (projectDoc.Data.Sync.QueuedCount > 0)
                {
                    await CancelProjectDocumentSyncAsync(projectDoc);

                    // Cancel all jobs for the source (if present)
                    string sourceProjectId = projectDoc.Data.TranslateConfig.Source?.ProjectRef;
                    if (!string.IsNullOrWhiteSpace(sourceProjectId))
                    {
                        IDocument<SFProject> sourceProjectDoc = await conn.FetchAsync<SFProject>(sourceProjectId);
                        if (sourceProjectDoc.IsLoaded && !sourceProjectDoc.Data.SyncDisabled)
                        {
                            if (sourceProjectDoc.Data.Sync.QueuedCount > 0)
                            {
                                await CancelProjectDocumentSyncAsync(sourceProjectDoc);
                            }
                        }
                    }
                }
            }
        }

        private async Task CancelProjectDocumentSyncAsync(IDocument<SFProject> projectDoc)
        {
            // Load the project secrets, so we can get any job ids
            if ((await _projectSecrets.TryGetAsync(projectDoc.Data.Id)).TryResult(out SFProjectSecret projectSecret))
            {
                // Cancel all jobs for the project
                foreach (string jobId in projectSecret.JobIds)
                {
                    _backgroundJobClient.Delete(jobId);
                }

                // Remove all job ids from the project secrets
                await _projectSecrets.UpdateAsync(projectSecret.Id, u =>
                {
                    u.Set(p => p.JobIds, new List<string>());
                });

                // Mark sync as cancelled
                await projectDoc.SubmitJson0OpAsync(op =>
                {
                    op.Set(pd => pd.Sync.QueuedCount, 0);
                    op.Unset(pd => pd.Sync.PercentCompleted);
                    op.Set(pd => pd.Sync.LastSyncSuccessful, false);
                });
            }
        }
    }
}
