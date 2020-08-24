using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
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
    [TestFixture]
    public class SyncAllTests
    {
        [Test]
        public async Task Inspects()
        {
            var env = new TestEnvironment();
            await env.syncAll.SynchronizeAllProjectsAsync(env.WebHost, false);
            await env.ParatextService.Received().GetProjectsAsync(Arg.Any<UserSecret>());
        }

        // This test uses a timer, but isn't part of a CI test suite.
        [Test]
        public async Task Sync()
        {
            var env = new TestEnvironment();
            Task syncTask = null;
            env.ParatextSyncRunner.RunAsync("project01", "user01", Arg.Any<bool>()).Returns((callInfo) =>
            {
                syncTask = Task.Run(() =>
                {
                    Task.Delay(1000).Wait();
                });
                return syncTask;
            });
            Assert.That(syncTask?.Status, Is.Not.EqualTo(TaskStatus.RanToCompletion));

            await env.syncAll.SynchronizeAllProjectsAsync(env.WebHost, true);

            // Projects were fetched. RunAsync was called. The RunAsync task was waited for.
            Assert.That(syncTask?.Status, Is.EqualTo(TaskStatus.RanToCompletion));
            await env.ParatextService.Received().GetProjectsAsync(Arg.Any<UserSecret>());
            await env.ParatextSyncRunner.Received().RunAsync("project01", "user01", Arg.Any<bool>());
        }

        private class TestEnvironment
        {
            public SyncAll syncAll = new SyncAll();

            public TestEnvironment()
            {
                WebHost = Substitute.For<IWebHost>();
                IServiceProvider serviceProvider = Substitute.For<IServiceProvider>();
                WebHost.Services.Returns(serviceProvider);
                RealtimeService = new SFMemoryRealtimeService();
                serviceProvider.GetService<IRealtimeService>().Returns(RealtimeService);
                ParatextService = Substitute.For<IParatextService>();
                serviceProvider.GetService<IParatextService>().Returns(ParatextService);
                var userSecrets = new MemoryRepository<UserSecret>(new[]
                {
                    new UserSecret { Id = "user01" , ParatextTokens = new Tokens
                        {
                            AccessToken = CreateAccessToken(DateTime.Now),
                            RefreshToken = "test_refresh_token"
                        }}
                });
                serviceProvider.GetService<IRepository<UserSecret>>().Returns(userSecrets);

                SetupSFData(true, true);

                ParatextSyncRunner = Substitute.For<IParatextSyncRunner>();
                serviceProvider.GetService<IParatextSyncRunner>().Returns(ParatextSyncRunner);
            }

            public IWebHost WebHost { get; }
            public IParatextService ParatextService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IParatextSyncRunner ParatextSyncRunner { get; }

            // The SetupSFData method was copied from ParatextSyncRunnerTests.cs and trimmed.
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
