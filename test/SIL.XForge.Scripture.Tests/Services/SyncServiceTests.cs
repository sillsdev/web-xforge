using System.Collections.Generic;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using Hangfire;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class SyncServiceTests
    {
        private static readonly string Project01 = "project01";
        private static readonly string Project02 = "project02";

        [Test]
        public void SyncAsync_Enqueues()
        {
            var env = new TestEnvironment();
            Assert.That(env.RealtimeService.GetRepository<SFProject>().Get(Project01).SyncDisabled, Is.False);
            // SUT
            Assert.DoesNotThrowAsync(() => env.Service.SyncAsync("userid", Project01, false));
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
                }));

                Service = new SyncService(BackgroundJobClient, RealtimeService);
            }

            public SyncService Service { get; }
            public IBackgroundJobClient BackgroundJobClient { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
        }
    }
}
