using System;
using System.Linq;
using System.Threading.Tasks;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Microsoft.AspNetCore.SignalR;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class SyncServiceTests
{
    private const string Project01 = "project01";
    private const string Project02 = "project02";
    private const string Project03 = "project03";
    private const string Project04 = "project04";
    private const string User01 = "user01";

    private static UserAccessorDto UserAccessor => new UserAccessorDto { UserId = User01 };

    [Test]
    public async Task SyncAsync_CancelSourceAndTarget()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

        // Run sync
        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify that the jobs were queued correctly
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Contains.Item("jobid"));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Contains.Item("jobid"));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.EqualTo(1));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.EqualTo(1));

        // Cancel sync
        await env.Service.CancelSyncAsync(User01, Project03);

        // Verify that the job was cancelled correctly
        env.BackgroundJobClient.Received(2).ChangeState("jobid", Arg.Any<DeletedState>(), null); // Same as Delete()
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Is.Empty);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.EqualTo(1));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.EqualTo(1));
    }

    [Test]
    public async Task SyncAsync_CancelSourceNotTarget()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

        // Run sync
        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify that the jobs were queued correctly
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Contains.Item("jobid"));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Contains.Item("jobid"));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.EqualTo(1));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.EqualTo(1));

        // Cancel sync
        await env.Service.CancelSyncAsync(User01, Project01);

        // Verify that the job was cancelled correctly
        env.BackgroundJobClient.Received(1).ChangeState("jobid", Arg.Any<DeletedState>(), null); // Same as Delete()
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Contains.Item("jobid"));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.EqualTo(1));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.EqualTo(1));
    }

    [Test]
    public async Task SyncAsync_CancelTargetWithoutSource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

        // Run sync
        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project01, UserAccessor = UserAccessor });

        // Verify that the job was queued correctly
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Contains.Item("jobid"));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Is.Empty);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.EqualTo(1));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.Zero);

        // Cancel sync
        await env.Service.CancelSyncAsync(User01, Project01);

        // Verify that the job was cancelled correctly
        env.BackgroundJobClient.Received(1).ChangeState("jobid", Arg.Any<DeletedState>(), null); // Same as Delete()
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Is.Empty);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.EqualTo(1));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.Zero);
    }

    [Test]
    public async Task SyncAsync_DoesNotTrainWhenNoSource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

        // Run sync
        await env.Service.SyncAsync(
            new SyncConfig
            {
                ProjectId = Project01,
                UserAccessor = UserAccessor,
                TrainEngine = true,
            }
        );

        // Verify that only a sync for the target was received
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());
    }

    [Test]
    public void SyncAsync_Enqueues()
    {
        var env = new TestEnvironment();
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).SyncDisabled, Is.False);
        // SUT
        Assert.DoesNotThrowAsync(
            () => env.Service.SyncAsync(new SyncConfig { ProjectId = Project01, UserAccessor = UserAccessor })
        );
    }

    [Test]
    public void SyncAsync_MissingTargetSecret()
    {
        var env = new TestEnvironment();
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).SyncDisabled, Is.False);
        // SUT
        Assert.ThrowsAsync<ArgumentException>(
            async () =>
                await env.Service.SyncAsync(new SyncConfig { ProjectId = Project04, UserAccessor = UserAccessor })
        );
    }

    [Test]
    public async Task SyncAsync_EnqueueTargetOnly()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

        // Run sync
        await env.Service.SyncAsync(
            new SyncConfig
            {
                ProjectId = Project03,
                TargetOnly = true,
                UserAccessor = UserAccessor,
            }
        );

        // Verify that the jobs were queued correctly
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Contains.Item("jobid"));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.EqualTo(1));
    }

    [Test]
    public async Task SyncAsync_EnqueuesTrainingJob()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

        // Run sync
        await env.Service.SyncAsync(
            new SyncConfig
            {
                ProjectId = Project03,
                UserAccessor = UserAccessor,
                TrainEngine = true,
            }
        );

        // Verify that three jobs were created - source, target, and training
        env.BackgroundJobClient.Received(3).Create(Arg.Any<Job>(), Arg.Any<IState>());

        // Verify the project secret
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project03).ServalData?.TranslationQueuedAt, Is.Not.Null);
        Assert.That(env.ProjectSecrets.Get(Project03).ServalData?.TranslationJobId, Is.Not.Null);
    }

    [Test]
    public async Task SyncAsync_EnqueuesSourceAndTarget()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

        // Run sync
        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify that the jobs were queued correctly
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Contains.Item("jobid"));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Contains.Item("jobid"));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.EqualTo(1));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.EqualTo(1));
    }

    [Test]
    public async Task SyncAsync_EnqueuedTargetWithoutSource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

        // Run sync
        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project01, UserAccessor = UserAccessor });

        // Verify that the job was queued correctly
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).Sync.QueuedCount, Is.EqualTo(1));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project03).Sync.QueuedCount, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds.Count, Is.EqualTo(1));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds.Count, Is.EqualTo(0));
        Assert.That(env.ProjectSecrets.Get(Project01).JobIds, Contains.Item("jobid"));
        Assert.That(env.ProjectSecrets.Get(Project02).JobIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).JobIds, Is.Empty);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project01), Is.EqualTo(1));
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project02), Is.Zero);
        Assert.That(env.SyncMetrics.Query().Count(s => s.ProjectRef == Project03), Is.Zero);
    }

    [Test]
    public async Task SyncAsync_SourceProjectSecretsRecordsSyncMetricsId()
    {
        var env = new TestEnvironment();

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project01, UserAccessor = UserAccessor });

        // Verify that the sync metrics ids are recorded in the project secrets
        string syncMetricsId = env.ProjectSecrets.Get(Project01).SyncMetricsIds.First();
        Assert.That(env.SyncMetrics.Get(syncMetricsId), Is.Not.Null);
        Assert.That(env.ProjectSecrets.Get(Project02).SyncMetricsIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).SyncMetricsIds, Is.Empty);

        await env.Service.CancelSyncAsync(User01, Project01);

        // Verify that the sync metrics are cleared from the project secrets
        Assert.That(env.ProjectSecrets.Get(Project01).SyncMetricsIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project02).SyncMetricsIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).SyncMetricsIds, Is.Empty);
    }

    [Test]
    public async Task SyncAsync_SourceAndTargetProjectSecretsRecordsSyncMetricsId()
    {
        var env = new TestEnvironment();

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify that the sync metrics ids are recorded in the project secrets
        string syncMetricsId01 = env.ProjectSecrets.Get(Project01).SyncMetricsIds.First();
        string syncMetricsId03 = env.ProjectSecrets.Get(Project03).SyncMetricsIds.First();
        Assert.That(env.SyncMetrics.Get(syncMetricsId01), Is.Not.Null);
        Assert.That(env.ProjectSecrets.Get(Project02).SyncMetricsIds, Is.Empty);
        Assert.That(env.SyncMetrics.Get(syncMetricsId03), Is.Not.Null);

        await env.Service.CancelSyncAsync(User01, Project03);

        // Verify that the sync metrics are cleared from the project secrets
        Assert.That(env.ProjectSecrets.Get(Project01).SyncMetricsIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project02).SyncMetricsIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project03).SyncMetricsIds, Is.Empty);
    }

    [Test]
    public async Task SyncAsync_SourceWithCancelledTargetProjectSecretsRecordsSyncMetricsId()
    {
        var env = new TestEnvironment();

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify that the sync metrics ids are recorded in the project secrets
        string syncMetricsId01 = env.ProjectSecrets.Get(Project01).SyncMetricsIds.First();
        string syncMetricsId03 = env.ProjectSecrets.Get(Project03).SyncMetricsIds.First();
        Assert.That(env.SyncMetrics.Get(syncMetricsId01), Is.Not.Null);
        Assert.That(env.ProjectSecrets.Get(Project02).SyncMetricsIds, Is.Empty);
        Assert.That(env.SyncMetrics.Get(syncMetricsId03), Is.Not.Null);

        await env.Service.CancelSyncAsync(User01, Project01);

        // Verify that the sync metrics are only cleared from the target project secrets
        Assert.That(env.ProjectSecrets.Get(Project01).SyncMetricsIds, Is.Empty);
        Assert.That(env.ProjectSecrets.Get(Project02).SyncMetricsIds, Is.Empty);
        Assert.That(env.SyncMetrics.Get(env.ProjectSecrets.Get(Project03).SyncMetricsIds.First()), Is.Not.Null);
    }

    [Test]
    public async Task SyncAsync_SyncMetricsSourceAndTargetCancelled()
    {
        var env = new TestEnvironment();
        Assert.That(env.SyncMetrics.Query().Any(), Is.False);

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify the sync metrics as queued
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Status,
            Is.EqualTo(SyncStatus.Queued)
        );
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project03).Status,
            Is.EqualTo(SyncStatus.Queued)
        );

        await env.Service.CancelSyncAsync(User01, Project03);

        // Verify the sync metrics as cancelled
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Status,
            Is.EqualTo(SyncStatus.Cancelled)
        );
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project03).Status,
            Is.EqualTo(SyncStatus.Cancelled)
        );
    }

    [Test]
    public async Task SyncAsync_SyncMetricsSourceAndTargetQueued()
    {
        var env = new TestEnvironment();
        Assert.That(env.SyncMetrics.Query().Any(), Is.False);

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify the sync metrics
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Status,
            Is.EqualTo(SyncStatus.Queued)
        );
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project03).Status,
            Is.EqualTo(SyncStatus.Queued)
        );
    }

    [Test]
    public async Task SyncAsync_SyncMetricsSourceNotTargetCancelled()
    {
        var env = new TestEnvironment();
        Assert.That(env.SyncMetrics.Query().Any(), Is.False);

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify the sync metrics as queued
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Status,
            Is.EqualTo(SyncStatus.Queued)
        );
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project03).Status,
            Is.EqualTo(SyncStatus.Queued)
        );

        await env.Service.CancelSyncAsync(User01, Project01);

        // Verify the sync metrics as cancelled
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Status,
            Is.EqualTo(SyncStatus.Cancelled)
        );
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project03).Status,
            Is.EqualTo(SyncStatus.Queued)
        );
    }

    [Test]
    public async Task SyncAsync_SyncMetricsSourceRequiresTarget()
    {
        var env = new TestEnvironment();
        Assert.That(env.SyncMetrics.Query().Any(), Is.False);

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project03, UserAccessor = UserAccessor });

        // Verify the sync metrics
        string sourceId = env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Id;
        string requiresId = env.SyncMetrics.Query().Single(s => s.ProjectRef == Project03).RequiresId;
        Assert.That(string.IsNullOrWhiteSpace(requiresId), Is.False);
        Assert.That(requiresId, Is.EqualTo(sourceId));
    }

    [Test]
    public async Task SyncAsync_SyncMetricsSpecifiesDateQueued()
    {
        var env = new TestEnvironment();
        DateTime beforeSync = DateTime.UtcNow;
        Assert.That(env.SyncMetrics.Query().Any(), Is.False);

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project01, UserAccessor = UserAccessor });
        DateTime afterSync = DateTime.UtcNow;

        // Verify the sync metrics
        var syncMetrics = env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01);
        Assert.That(syncMetrics.DateQueued, Is.GreaterThanOrEqualTo(beforeSync));
        Assert.That(syncMetrics.DateQueued, Is.LessThanOrEqualTo(afterSync));
        Assert.That(syncMetrics.DateStarted, Is.Null);
        Assert.That(syncMetrics.DateFinished, Is.Null);
    }

    [Test]
    public async Task SyncAsync_SyncMetricsSpecifiesUser()
    {
        var env = new TestEnvironment();
        Assert.That(env.SyncMetrics.Query().Any(), Is.False);

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project01, UserAccessor = UserAccessor });

        // Verify the sync metrics
        Assert.That(env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).UserRef, Is.EqualTo(User01));
    }

    [Test]
    public async Task SyncAsync_SyncMetricsTargetOnlyCancelled()
    {
        var env = new TestEnvironment();
        Assert.That(env.SyncMetrics.Query().Any(), Is.False);

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project01, UserAccessor = UserAccessor });

        // Verify the sync metrics as queued
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Status,
            Is.EqualTo(SyncStatus.Queued)
        );

        await env.Service.CancelSyncAsync(User01, Project01);

        // Verify the sync metrics as cancelled
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Status,
            Is.EqualTo(SyncStatus.Cancelled)
        );
    }

    [Test]
    public async Task SyncAsync_SyncMetricsTargetOnlyQueued()
    {
        var env = new TestEnvironment();
        Assert.That(env.SyncMetrics.Query().Any(), Is.False);

        await env.Service.SyncAsync(new SyncConfig { ProjectId = Project01, UserAccessor = UserAccessor });

        // Verify the sync metrics
        Assert.That(
            env.SyncMetrics.Query().Single(s => s.ProjectRef == Project01).Status,
            Is.EqualTo(SyncStatus.Queued)
        );
    }

    [Test]
    public void SyncAsync_NotIfSyncDisabled()
    {
        var env = new TestEnvironment();
        Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).SyncDisabled, Is.True, "setup");
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.SyncAsync(new SyncConfig { ProjectId = Project02, UserAccessor = UserAccessor })
        );
    }

    [Test]
    public void SyncAsync_WarnIfAnomalousQueuedCount()
    {
        var env = new TestEnvironment();

        env.Service.WarnIfAnomalousQueuedCount(0, "");
        env.MockLogger.AssertNoEvent(
            logEvent => logEvent.Message.Contains("QueuedCount"),
            "No warning should have been logged for reasonable queued count 0."
        );

        env.Service.WarnIfAnomalousQueuedCount(1, "");
        env.MockLogger.AssertNoEvent(
            logEvent => logEvent.Message.Contains("QueuedCount"),
            "No warning should have been logged for reasonable queued count 1."
        );

        env.Service.WarnIfAnomalousQueuedCount(-1, "");
        env.MockLogger.AssertHasEvent(
            logEvent => logEvent.Message.Contains("QueuedCount"),
            "Warn for unexpected queued count -1."
        );

        env.Service.WarnIfAnomalousQueuedCount(2, "");
        env.MockLogger.AssertHasEvent(
            logEvent => logEvent.Message.Contains("QueuedCount"),
            "Warn for less expected queued count 2."
        );
    }

    private class TestEnvironment
    {
        public MockLogger<SyncService> MockLogger { get; }

        public TestEnvironment()
        {
            BackgroundJobClient = Substitute.For<IBackgroundJobClient>();
            var hubContext = Substitute.For<IHubContext<NotificationHub, INotifier>>();
            ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                [
                    new SFProjectSecret { Id = Project01 },
                    new SFProjectSecret { Id = Project02 },
                    new SFProjectSecret { Id = Project03, ServalData = new ServalData() },
                ]
            );
            SyncMetrics = new MemoryRepository<SyncMetrics>();
            RealtimeService = new SFMemoryRealtimeService();

            RealtimeService.AddRepository(
                "sf_projects",
                OTType.Json0,
                new MemoryRepository<SFProject>(
                    [
                        new SFProject
                        {
                            Id = Project01,
                            Name = "project01",
                            ShortName = "P01",
                        },
                        new SFProject
                        {
                            Id = Project02,
                            Name = "project02",
                            ShortName = "P02",
                            SyncDisabled = true,
                        },
                        new SFProject
                        {
                            Id = Project03,
                            Name = "project03",
                            ShortName = "P03",
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = true,
                                Source = new TranslateSource { ProjectRef = Project01 },
                            },
                        },
                        new SFProject
                        {
                            Id = Project04,
                            Name = "project04",
                            ShortName = "P04",
                        },
                    ]
                )
            );

            MockLogger = new MockLogger<SyncService>();

            Service = new SyncService(
                BackgroundJobClient,
                hubContext,
                ProjectSecrets,
                SyncMetrics,
                RealtimeService,
                MockLogger
            );
        }

        public SyncService Service { get; }
        public IBackgroundJobClient BackgroundJobClient { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public SFMemoryRealtimeService RealtimeService { get; }
        public MemoryRepository<SyncMetrics> SyncMetrics { get; }
    }
}
