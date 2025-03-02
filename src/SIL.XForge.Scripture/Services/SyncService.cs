using System;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Hangfire.States;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// This class manages syncing SF with the Paratext web service APIs.
/// </summary>
public class SyncService(
    IBackgroundJobClient backgroundJobClient,
    IHubContext<NotificationHub, INotifier> hubContext,
    IRepository<SFProjectSecret> projectSecrets,
    IRepository<SyncMetrics> metrics,
    IRealtimeService realtimeService,
    ILogger<SyncService> logger
) : ISyncService
{
    /// <summary>
    /// Syncs a project and its source project (if applicable).
    /// </summary>
    /// <param name="syncConfig">The sync configuration.</param>
    /// <returns>The job id for the project.</returns>
    /// <exception cref="ForbiddenException">Sync is disabled for this project.</exception>
    /// <exception cref="ArgumentException">The source or target project cannot be found.</exception>
    public async Task<string> SyncAsync(SyncConfig syncConfig)
    {
        await using IConnection conn = await realtimeService.ConnectAsync(syncConfig.UserAccessor.UserId);
        // Load the project document
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(syncConfig.ProjectId);
        if (projectDoc.Data.SyncDisabled)
        {
            throw new ForbiddenException();
        }

        // Load the target project secrets, so we can store the job id
        if (!(await projectSecrets.TryGetAsync(syncConfig.ProjectId)).TryResult(out SFProjectSecret projectSecret))
        {
            throw new ArgumentException("The target project secret cannot be found.");
        }

        // See if we can sync the source project
        string sourceProjectId = projectDoc.Data.TranslateConfig.Source?.ProjectRef;
        if (!string.IsNullOrWhiteSpace(sourceProjectId) && !syncConfig.TargetOnly)
        {
            IDocument<SFProject> sourceProjectDoc = await conn.FetchAsync<SFProject>(sourceProjectId);
            if (sourceProjectDoc.IsLoaded && !sourceProjectDoc.Data.SyncDisabled)
            {
                // Load the source project secrets, so we can store the job id
                if (
                    !(await projectSecrets.TryGetAsync(sourceProjectId)).TryResult(
                        out SFProjectSecret sourceProjectSecret
                    )
                )
                {
                    throw new ArgumentException("The source project secret cannot be found.");
                }

                // Create the sync metrics for the source and target projects
                var sourceSyncMetrics = new SyncMetrics
                {
                    DateQueued = DateTime.UtcNow,
                    Id = ObjectId.GenerateNewId().ToString()!,
                    ProjectRef = sourceProjectId,
                    Status = SyncStatus.Queued,
                    UserRef = syncConfig.UserAccessor.UserId,
                };
                await metrics.InsertAsync(sourceSyncMetrics);
                var targetSyncMetrics = new SyncMetrics
                {
                    DateQueued = DateTime.UtcNow,
                    Id = ObjectId.GenerateNewId().ToString()!,
                    ProjectRef = syncConfig.ProjectId,
                    RequiresId = sourceSyncMetrics.Id,
                    Status = SyncStatus.Queued,
                    UserRef = syncConfig.UserAccessor.UserId,
                };
                await metrics.InsertAsync(targetSyncMetrics);

                // Schedule the sync for 5 minutes to give us enough time to update the project's sync object
                // We do this because there is no "draft" status in hangfire - this is close enough
                // After we do that, we will enqueue the job. We do it this way because we don't want to start
                // the job unless the queued count and job ids have been incremented appropriately.
                // We need to sync the source first so that we can link the source texts and train the engine.
                string sourceJobId = !string.IsNullOrWhiteSpace(syncConfig.ParentJobId)
                    ? backgroundJobClient.ContinueJobWith<ParatextSyncRunner>(
                        syncConfig.ParentJobId,
                        r =>
                            r.RunAsync(
                                sourceProjectId,
                                syncConfig.UserAccessor,
                                sourceSyncMetrics.Id,
                                false,
                                CancellationToken.None
                            ),
                        null,
                        JobContinuationOptions.OnAnyFinishedState
                    )
                    : backgroundJobClient.Schedule<ParatextSyncRunner>(
                        r =>
                            r.RunAsync(
                                sourceProjectId,
                                syncConfig.UserAccessor,
                                sourceSyncMetrics.Id,
                                false,
                                CancellationToken.None
                            ),
                        TimeSpan.FromMinutes(5)
                    );
                string targetJobId = backgroundJobClient.ContinueJobWith<ParatextSyncRunner>(
                    sourceJobId,
                    r =>
                        r.RunAsync(
                            syncConfig.ProjectId,
                            syncConfig.UserAccessor,
                            targetSyncMetrics.Id,
                            syncConfig.TrainEngine,
                            CancellationToken.None
                        ),
                    null,
                    JobContinuationOptions.OnAnyFinishedState
                );
                logger.LogInformation(
                    $"Queueing sync for source project {sourceProjectId} with sync metrics id {sourceSyncMetrics.Id}"
                );
                logger.LogInformation(
                    $"Queueing sync for target project {syncConfig.ProjectId} with sync metrics id {targetSyncMetrics.Id}"
                );
                try
                {
                    await projectDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));
                    WarnIfAnomalousQueuedCount(
                        projectDoc.Data.Sync.QueuedCount,
                        $"For daughter SF project id {projectDoc.Id} after inc."
                    );
                    await sourceProjectDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));
                    WarnIfAnomalousQueuedCount(
                        sourceProjectDoc.Data.Sync.QueuedCount,
                        $"For parent SF project id {sourceProjectDoc.Id} after inc."
                    );

                    // Store the source job id, so we can cancel the job later if needed
                    await projectSecrets.UpdateAsync(
                        sourceProjectSecret.Id,
                        u =>
                        {
                            u.Add(p => p.JobIds, sourceJobId);
                            u.Add(p => p.SyncMetricsIds, sourceSyncMetrics.Id);
                        }
                    );

                    // Store the target job id, so we can cancel the job later if needed
                    await projectSecrets.UpdateAsync(
                        projectSecret.Id,
                        u =>
                        {
                            u.Add(p => p.JobIds, targetJobId);
                            u.Add(p => p.SyncMetricsIds, targetSyncMetrics.Id);
                        }
                    );

                    backgroundJobClient.ChangeState(sourceJobId, new EnqueuedState());
                }
                catch (Exception)
                {
                    // Delete the jobs on error, and notify the user
                    backgroundJobClient.Delete(targetJobId);
                    backgroundJobClient.Delete(sourceJobId);
                    throw;
                }

                // If we are not training SMT suggestions
                if (!syncConfig.TrainEngine)
                {
                    // Exit so we don't queue the target again, later in this method
                    return targetJobId;
                }

                // Schedule the build of SMT translation suggestions
                string? buildJobId = null;
                try
                {
                    // Build the SMT suggestions after the target has synced successfully
                    buildJobId = backgroundJobClient.ContinueJobWith<MachineProjectService>(
                        targetJobId,
                        r =>
                            r.BuildProjectForBackgroundJobAsync(
                                syncConfig.UserAccessor,
                                new BuildConfig { ProjectId = syncConfig.ProjectId },
                                false,
                                CancellationToken.None
                            ),
                        null,
                        JobContinuationOptions.OnAnyFinishedState
                    );

                    // Set the translation queued date and time, and hang fire job id
                    await projectSecrets.UpdateAsync(
                        projectSecret.Id,
                        u =>
                        {
                            u.Set(p => p.ServalData.TranslationJobId, buildJobId);
                            u.Set(p => p.ServalData.TranslationQueuedAt, DateTime.UtcNow);
                            u.Unset(p => p.ServalData.TranslationErrorMessage);
                        }
                    );

                    // Return the build job id as it is the last in the chain
                    return buildJobId;
                }
                catch (Exception)
                {
                    // Any exceptions should not halt the sync process
                    if (!string.IsNullOrWhiteSpace(buildJobId))
                    {
                        // We only need to delete the build job
                        backgroundJobClient.Delete(buildJobId);
                    }

                    // Return the target job id, as the build job was not created
                    return targetJobId;
                }
            }
        }

        // Create the sync metrics for this project
        var syncMetrics = new SyncMetrics
        {
            DateQueued = DateTime.UtcNow,
            Id = ObjectId.GenerateNewId().ToString()!,
            ProjectRef = syncConfig.ProjectId,
            Status = SyncStatus.Queued,
            UserRef = syncConfig.UserAccessor.UserId,
        };
        await metrics.InsertAsync(syncMetrics);

        // Sync the target project only, as it does not have a source, or the source cannot be synced
        // See the comments in the block above regarding scheduling for rationale on the process
        string jobId = !string.IsNullOrWhiteSpace(syncConfig.ParentJobId)
            ? backgroundJobClient.ContinueJobWith<ParatextSyncRunner>(
                syncConfig.ParentJobId,
                r =>
                    r.RunAsync(
                        syncConfig.ProjectId,
                        syncConfig.UserAccessor,
                        syncMetrics.Id,
                        syncConfig.TrainEngine,
                        CancellationToken.None
                    ),
                null,
                JobContinuationOptions.OnAnyFinishedState
            )
            : backgroundJobClient.Schedule<ParatextSyncRunner>(
                r =>
                    r.RunAsync(
                        syncConfig.ProjectId,
                        syncConfig.UserAccessor,
                        syncMetrics.Id,
                        syncConfig.TrainEngine,
                        CancellationToken.None
                    ),
                TimeSpan.FromMinutes(5)
            );
        logger.LogInformation(
            $"Queueing sync for project {syncConfig.ProjectId} with sync metrics id {syncMetrics.Id}"
        );
        try
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));
            WarnIfAnomalousQueuedCount(
                projectDoc.Data.Sync.QueuedCount,
                $"For SF project id {projectDoc.Id} after inc."
            );

            // Store the job id, so we can cancel the job later if needed
            await projectSecrets.UpdateAsync(
                projectSecret.Id,
                u =>
                {
                    u.Add(p => p.JobIds, jobId);
                    u.Add(p => p.SyncMetricsIds, syncMetrics.Id);
                }
            );

            backgroundJobClient.ChangeState(jobId, new EnqueuedState());
            return jobId;
        }
        catch (Exception)
        {
            // Delete the job on error, and notify the user
            backgroundJobClient.Delete(jobId);
            throw;
        }
    }

    public async Task CancelSyncAsync(string curUserId, string projectId)
    {
        await using IConnection conn = await realtimeService.ConnectAsync(curUserId);
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

    /// <summary>
    /// Helper method to warn when QueuedCount is an unexpected value, to assist in investigating problems.
    /// </summary>
    internal void WarnIfAnomalousQueuedCount(int queuedCount, string details)
    {
        if (queuedCount == 0 || queuedCount == 1)
        {
            return;
        }
        string message = $"SyncService: Project has unexpected QueuedCount of {queuedCount}.";
        if (!string.IsNullOrEmpty(details))
        {
            message += $" {details}";
        }
        logger.LogWarning(message);
    }

    private async Task CancelProjectDocumentSyncAsync(IDocument<SFProject> projectDoc)
    {
        // Load the project secrets, so we can get any job ids
        if ((await projectSecrets.TryGetAsync(projectDoc.Data.Id)).TryResult(out SFProjectSecret projectSecret))
        {
            // Cancel all jobs for the project
            foreach (string jobId in projectSecret.JobIds)
            {
                backgroundJobClient.Delete(jobId);
            }

            // Mark all sync metrics as cancelled
            foreach (string syncMetricsId in projectSecret.SyncMetricsIds)
            {
                logger.LogInformation(
                    $"Cancelling sync for project {projectSecret.Id} with sync metrics id {syncMetricsId}"
                );
                await metrics.UpdateAsync(syncMetricsId, u => u.Set(s => s.Status, SyncStatus.Cancelled));
            }

            // Remove all job ids and sync metrics ids from the project secrets
            await projectSecrets.UpdateAsync(
                projectSecret.Id,
                u =>
                {
                    u.Set(p => p.JobIds, []);
                    u.Set(p => p.SyncMetricsIds, []);
                }
            );

            WarnIfAnomalousQueuedCount(
                projectDoc.Data.Sync.QueuedCount,
                $"For SF project id {projectDoc.Id} before setting QueuedCount to 0 as part of cancelling."
            );
            // Mark sync as cancelled
            await hubContext.NotifySyncProgress(projectDoc.Id, ProgressState.Completed);
            await projectDoc.SubmitJson0OpAsync(op =>
            {
                op.Set(pd => pd.Sync.QueuedCount, 0);
                op.Set(pd => pd.Sync.LastSyncSuccessful, false);
            });
        }
    }
}
