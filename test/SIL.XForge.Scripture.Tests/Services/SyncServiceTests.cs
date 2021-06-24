using System.Collections.Generic;
using System.Threading.Tasks;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class SyncServiceTests
    {
        private static readonly string Project01 = "project01";
        private static readonly string Project02 = "project02";
        private static readonly string Project03 = "project03";

        [Test]
        public async Task SyncAsync_CancelSourceAndTarget()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

            // Run sync
            await env.Service.SyncAsync("userid", Project03, false);

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

            // Cancel sync
            await env.Service.CancelSyncAsync("userid", Project03);

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
        }

        [Test]
        public async Task SyncAsync_CancelSourceNotTarget()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

            // Run sync
            await env.Service.SyncAsync("userid", Project03, false);

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

            // Cancel sync
            await env.Service.CancelSyncAsync("userid", Project01);

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
        }

        [Test]
        public async Task SyncAsync_CancelTargetWithoutSource()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

            // Run sync
            await env.Service.SyncAsync("userid", Project01, false);

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

            // Cancel sync
            await env.Service.CancelSyncAsync("userid", Project01);

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
        }

        [Test]
        public void SyncAsync_Enqueues()
        {
            var env = new TestEnvironment();
            Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).SyncDisabled, Is.False);
            // SUT
            Assert.DoesNotThrowAsync(() => env.Service.SyncAsync("userid", Project01, false));
        }

        [Test]
        public async Task SyncAsync_EnqueuesSourceAndTarget()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

            // Run sync
            await env.Service.SyncAsync("userid", Project03, false);

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
        }

        [Test]
        public async Task SyncAsync_DoesntEnqueueSourceIfTranslationSuggestionsDisabled()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");
            await env.RealtimeService.GetRepository<SFProject>().UpdateAsync(p => p.Id == "project03", u =>
                    u.Set(pr => pr.TranslateConfig.TranslationSuggestionsEnabled, false));

            // Run sync
            await env.Service.SyncAsync("userid", Project03, false);

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
        }

        [Test]
        public async Task SyncAsync_EnqueuedTargetWithoutSource()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Returns("jobid");

            // Run sync
            await env.Service.SyncAsync("userid", Project01, false);

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
        }

        [Test]
        public void SyncAsync_NotIfSyncDisabled()
        {
            var env = new TestEnvironment();
            Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project02).SyncDisabled, Is.True, "setup");
            Assert.ThrowsAsync<ForbiddenException>(() => env.Service.SyncAsync("userid", Project02, false));
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                BackgroundJobClient = Substitute.For<IBackgroundJobClient>();
                ProjectSecrets = new MemoryRepository<SFProjectSecret>(new[]
                {
                    new SFProjectSecret { Id = "project01" },
                    new SFProjectSecret { Id = "project02" },
                    new SFProjectSecret { Id = "project03" },
                });
                RealtimeService = new SFMemoryRealtimeService();

                RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = Project01,
                            Name = "project01",
                            ShortName = "P01",
                            CheckingConfig = new CheckingConfig
                            {
                                ShareEnabled = false
                            },
                            UserRoles = new Dictionary<string, string>
                            {
                            },
                        },
                        new SFProject
                        {
                            Id = Project02,
                            Name = "project02",
                            ShortName = "P02",
                            CheckingConfig = new CheckingConfig
                            {
                                ShareEnabled = false
                            },
                            UserRoles = new Dictionary<string, string>
                            {
                            },
                            SyncDisabled = true
                        },
                        new SFProject
                        {
                            Id = Project03,
                            Name = "project03",
                            ShortName = "P03",
                            CheckingConfig = new CheckingConfig
                            {
                                ShareEnabled = false
                            },
                            UserRoles = new Dictionary<string, string>
                            {
                            },
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = true,
                                Source = new TranslateSource
                                {
                                    ProjectRef = Project01
                                }
                            }
                        }
                }));

                Service = new SyncService(BackgroundJobClient, ProjectSecrets, RealtimeService);
            }

            public SyncService Service { get; }
            public IBackgroundJobClient BackgroundJobClient { get; }
            public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
        }
    }
}
