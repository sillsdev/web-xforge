using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.IdentityModel.Tokens;
using NSubstitute;
using NUnit.Framework;
using IdentityModel;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Scripture.Services;

namespace PtdaSyncAll
{
    /// <remarks>
    /// These tests use timers, but are not part of a CI suite.
    /// </remarks>
    [TestFixture]
    public class SyncAllServiceTests
    {
        [Test]
        public async Task Inspects()
        {
            var env = new TestEnvironment();
            await env.Service.SynchronizeAllProjectsAsync(false);
            await env.ParatextService.Received().GetProjectsAsync(Arg.Any<UserSecret>());
        }

        [Test]
        public async Task Sync()
        {
            var env = new TestEnvironment();
            Task syncTask = null;
            env.ParatextSyncRunner.RunAsync("project01", "user01", Arg.Any<bool>()).Returns((callInfo) =>
            {
                syncTask = Task.Run(() =>
                {
                    Task.Delay(10000).Wait();
                });
                return syncTask;
            });
            Assert.That(syncTask?.Status, Is.Not.EqualTo(TaskStatus.RanToCompletion));

            await env.Service.SynchronizeAllProjectsAsync(true);

            // Projects were fetched. RunAsync was called. The RunAsync task was waited for.
            Assert.That(syncTask?.Status, Is.EqualTo(TaskStatus.RanToCompletion));
            await env.ParatextService.Received().GetProjectsAsync(Arg.Any<UserSecret>());
            await env.ParatextSyncRunner.Received().RunAsync("project01", "user01", Arg.Any<bool>());

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("All sync tasks finished with a claimed Task status of Completed Successfully")));
            env.ProgramLogger.DidNotReceive().Log(Arg.Is<string>((string message) =>
                message.Contains("There was a problem with one or more synchronization tasks")));
        }

        [Test]
        public async Task Sync_MultipleProjectsSynchronized_ByDefault()
        {
            var env = new TestEnvironment();
            Dictionary<string, Task> synchronizationTasks = env.SetupSynchronizationTasks();
            // Synchronization tasks have not started yet.
            Assert.That(synchronizationTasks.Count, Is.EqualTo(0));

            await env.Service.SynchronizeAllProjectsAsync(true);

            Task syncTaskProject01 = synchronizationTasks.GetValueOrDefault("project01");
            Task syncTaskProject02 = synchronizationTasks.GetValueOrDefault("project02");
            Assert.That(syncTaskProject01.Status, Is.EqualTo(TaskStatus.RanToCompletion));
            Assert.That(syncTaskProject02.Status, Is.EqualTo(TaskStatus.RanToCompletion));
            await env.ParatextService.Received().GetProjectsAsync(Arg.Any<UserSecret>());
            await env.ParatextSyncRunner.Received().RunAsync("project01", "user01", Arg.Any<bool>());
            await env.ParatextSyncRunner.Received().RunAsync("project02", "user01", Arg.Any<bool>());

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("All sync tasks finished with a claimed Task status of Completed Successfully")));
            env.ProgramLogger.DidNotReceive().Log(Arg.Is<string>((string message) =>
                message.Contains("There was a problem with one or more synchronization tasks")));

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("> PT project P01")));
            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("> PT project P02")));

            env.ProgramLogger.DidNotReceive().Log(Arg.Is<string>((string message) =>
                message.Contains("subset of projects")));
        }

        [Test]
        public async Task Sync_MultipleProjectsSynchronized_WhenRequested()
        {
            var env = new TestEnvironment();
            Dictionary<string, Task> synchronizationTasks = env.SetupSynchronizationTasks();
            // Synchronization tasks have not started yet.
            Assert.That(synchronizationTasks.Count, Is.EqualTo(0));

            var sfProjectIdsToSynchronize = new HashSet<string>();
            sfProjectIdsToSynchronize.Add("project01");
            sfProjectIdsToSynchronize.Add("project02");
            await env.Service.SynchronizeAllProjectsAsync(true, sfProjectIdsToSynchronize);

            Task syncTaskProject01 = synchronizationTasks.GetValueOrDefault("project01");
            Task syncTaskProject02 = synchronizationTasks.GetValueOrDefault("project02");
            Assert.That(syncTaskProject01.Status, Is.EqualTo(TaskStatus.RanToCompletion));
            Assert.That(syncTaskProject02.Status, Is.EqualTo(TaskStatus.RanToCompletion));
            await env.ParatextService.Received().GetProjectsAsync(Arg.Any<UserSecret>());
            await env.ParatextSyncRunner.Received().RunAsync("project01", "user01", Arg.Any<bool>());
            await env.ParatextSyncRunner.Received().RunAsync("project02", "user01", Arg.Any<bool>());

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("All sync tasks finished with a claimed Task status of Completed Successfully")));
            env.ProgramLogger.DidNotReceive().Log(Arg.Is<string>((string message) =>
                message.Contains("There was a problem with one or more synchronization tasks")));

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("> PT project P01")));
            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("> PT project P02")));

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("subset of projects")));
        }

        [Test]
        public async Task Sync_SubsetSynchronized()
        {
            var env = new TestEnvironment();
            Dictionary<string, Task> synchronizationTasks = env.SetupSynchronizationTasks();
            // Synchronization tasks have not started yet.
            Assert.That(synchronizationTasks.Count, Is.EqualTo(0));

            var sfProjectIdsToSynchronize = new HashSet<string>();
            sfProjectIdsToSynchronize.Add("project01");
            await env.Service.SynchronizeAllProjectsAsync(true, sfProjectIdsToSynchronize);

            Task syncTaskProject01 = synchronizationTasks.GetValueOrDefault("project01");
            Task syncTaskProject02 = synchronizationTasks.GetValueOrDefault("project02");
            Assert.That(syncTaskProject01.Status, Is.EqualTo(TaskStatus.RanToCompletion));
            Assert.That(syncTaskProject02, Is.Null);
            await env.ParatextService.Received().GetProjectsAsync(Arg.Any<UserSecret>());
            await env.ParatextSyncRunner.Received().RunAsync("project01", "user01", Arg.Any<bool>());
            await env.ParatextSyncRunner.DidNotReceive().RunAsync("project02", "user01", Arg.Any<bool>());

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("All sync tasks finished with a claimed Task status of Completed Successfully")));
            env.ProgramLogger.DidNotReceive().Log(Arg.Is<string>((string message) =>
                message.Contains("There was a problem with one or more synchronization tasks")));

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("> PT project P01")));
            env.ProgramLogger.DidNotReceive().Log(Arg.Is<string>((string message) =>
                message.Contains("> PT project P02")));

            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("subset of projects")));
        }

        [Test]
        public async Task Sync_ThrowReported()
        {
            var env = new TestEnvironment();
            Task syncTask = null;
            env.ParatextSyncRunner.RunAsync("project01", "user01", Arg.Any<bool>()).Returns((callInfo) =>
            {
                syncTask = Task.Run(() =>
                {
                    Task.Delay(10000).Wait();
                    throw new Exception("Everything broke.");
                });
                return syncTask;
            });
            Assert.That(syncTask?.Status, Is.Not.EqualTo(TaskStatus.RanToCompletion));

            await env.Service.SynchronizeAllProjectsAsync(true);

            // Exceptions thrown from the synchronization are reported.
            Assert.That(syncTask?.Status, Is.EqualTo(TaskStatus.Faulted));
            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("There was a problem with one or more synchronization tasks")));
            env.ProgramLogger.Received().Log(Arg.Is<string>((string message) =>
                message.Contains("One or more sync tasks did not complete successfully")));
        }

        private class TestEnvironment
        {

            public TestEnvironment()
            {
                IServiceProvider serviceProvider = Substitute.For<IServiceProvider>();
                RealtimeService = new SFMemoryRealtimeService();
                ParatextService = Substitute.For<IParatextService>();
                var userSecrets = new MemoryRepository<UserSecret>(new[]
                {
                    new UserSecret { Id = "user01" , ParatextTokens = new Tokens
                        {
                            AccessToken = CreateAccessToken(DateTime.Now),
                            RefreshToken = "test_refresh_token"
                        }}
                });

                SetupSFData(true, true);

                ParatextSyncRunner = Substitute.For<IParatextSyncRunner>();
                Func<IParatextSyncRunner> syncRunnerFactory = () => ParatextSyncRunner;

                ProgramLogger = Substitute.For<IProgramLogger>();
                Service = new SyncAllService(syncRunnerFactory, RealtimeService, ParatextService, userSecrets,
                    ProgramLogger);
            }

            public SyncAllService Service { get; }
            public IParatextService ParatextService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IParatextSyncRunner ParatextSyncRunner { get; }
            public IProgramLogger ProgramLogger { get; }

            public Dictionary<string, Task> SetupSynchronizationTasks()
            {
                var synchronizationTasks = new Dictionary<string, Task>();
                ParatextSyncRunner.RunAsync("project01", "user01", Arg.Any<bool>()).Returns((callInfo) =>
                {
                    Task project01task = Task.Run(() =>
                    {
                        Task.Delay(10000).Wait();
                    });
                    synchronizationTasks.Add("project01", project01task);
                    return project01task;
                });
                ParatextSyncRunner.RunAsync("project02", "user01", Arg.Any<bool>()).Returns((callInfo) =>
                {
                    Task project02task = Task.Run(() =>
                    {
                        Task.Delay(15000).Wait();
                    });
                    synchronizationTasks.Add("project02", project02task);
                    return project02task;
                });
                return synchronizationTasks;
            }

            // The SetupSFData method was copied from ParatextSyncRunnerTests.cs, trimmed, and modified.
            public void SetupSFData(bool translationSuggestionsEnabled, bool checkingEnabled)
            {
                RealtimeService.AddRepository("users", OTType.Json0, new MemoryRepository<User>(new[]
                {
                    new User
                    {
                        Id = "user01",
                        ParatextId = "pt01"
                    },
                    new User
                    {
                        Id = "user02",
                        ParatextId = "pt02"
                    }
                }));
                RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = "project01",
                            Name = "project01",
                            ShortName = "P01",
                            UserRoles = new Dictionary<string, string>
                            {
                                { "user01", SFProjectRole.Administrator },
                                { "user02", SFProjectRole.Translator }
                            },
                            ParatextId = "target",
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                                Source = new TranslateSource
                                {
                                    ParatextId = "source",
                                    Name = "Source",
                                    ShortName = "SRC",
                                    WritingSystem = new WritingSystem
                                    {
                                        Tag = "en"
                                    }
                                }
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                CheckingEnabled = checkingEnabled
                            },
                            Sync = new Sync
                            {
                                QueuedCount = 1
                            }
                        },
                        new SFProject
                        {
                            Id = "project02",
                            Name = "project02",
                            ShortName = "P02",
                            UserRoles = new Dictionary<string, string>
                            {
                                { "user01", SFProjectRole.Administrator },
                                { "user02", SFProjectRole.Translator }
                            },
                            ParatextId = "target",
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                                Source = new TranslateSource
                                {
                                    ParatextId = "source",
                                    Name = "Source",
                                    ShortName = "SR2",
                                    WritingSystem = new WritingSystem
                                    {
                                        Tag = "en"
                                    }
                                }
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                CheckingEnabled = checkingEnabled
                            },
                            Sync = new Sync
                            {
                                QueuedCount = 1
                            }
                        }
                    }));

                RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
                RealtimeService.AddRepository("questions", OTType.Json0, new MemoryRepository<Question>());
            }

            // The CreateAccessToken method was copied verbatim from UserServiceTests.cs.
            private string CreateAccessToken(DateTime issuedAt)
            {
                var token = new JwtSecurityToken("ptreg_rsa", "pt-api",
                    new[]
                    {
                        new Claim(JwtClaimTypes.Subject, "paratext01"),
                        new Claim(JwtClaimTypes.IssuedAt, EpochTime.GetIntDate(issuedAt).ToString())
                    },
                    expires: issuedAt + TimeSpan.FromMinutes(5));
                var handler = new JwtSecurityTokenHandler();
                return handler.WriteToken(token);
            }
        }
    }
}
