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
            }

            public IWebHost WebHost { get; }
            public IParatextService ParatextService { get; }
            public SFMemoryRealtimeService RealtimeService { get; }

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
