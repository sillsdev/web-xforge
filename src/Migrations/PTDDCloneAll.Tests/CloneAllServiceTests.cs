using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Services;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Scripture.Services;

namespace PTDDCloneAll
{
    [TestFixture]
    public class CloneAllServiceTests
    {
        [Test]
        public async Task CloneSFProjects_SingleProject_ProjectCloned()
        {
            var env = new TestEnvironment();
            string[] projectIds = new[] { "project01" };
            IEnumerable<SFProject> projectsToClone = await env.GetSFProjects(projectIds);
            await env.Service.CloneSFProjects(CloneAllService.CLONE, projectsToClone);
            await env.PTDDSyncRunner.Received(1).RunAsync("project01", "user01", Arg.Any<bool>(), Arg.Any<bool>());
            await env.PTDDSyncRunner
                .DidNotReceive()
                .RunAsync("project02", Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<bool>());
        }

        [Test]
        public async Task CloneSFProjects_MultipleProjects_EachCloned()
        {
            var env = new TestEnvironment();
            string[] projectIds = new[] { "project01", "project02" };
            IEnumerable<SFProject> projectsToClone = await env.GetSFProjects(projectIds);
            await env.Service.CloneSFProjects(CloneAllService.CLONE, projectsToClone);
            await env.PTDDSyncRunner.Received(1).RunAsync("project01", "user01", Arg.Any<bool>(), Arg.Any<bool>());
            await env.PTDDSyncRunner
                .Received(1)
                .RunAsync("project02", Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<bool>());
        }

        [Test]
        public async Task CloneSFProjects_ProjectAlreadyExists_SkipsProject()
        {
            var env = new TestEnvironment();
            string[] projectIds = new[] { "project01", "project02" };
            IEnumerable<SFProject> projectsToClone = await env.GetSFProjects(projectIds);
            string project01Path = Path.Combine("scriptureforge", "sync", "target01");
            env.FileSystemService.DirectoryExists(project01Path).Returns(true);
            await env.Service.CloneSFProjects(CloneAllService.CLONE, projectsToClone);
            env.FileSystemService.Received(2).DirectoryExists(Arg.Any<string>());
            await env.PTDDSyncRunner
                .DidNotReceive()
                .RunAsync("project01", Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<bool>());
            await env.PTDDSyncRunner
                .Received(1)
                .RunAsync("project02", Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<bool>());
        }
    }

    class TestEnvironment
    {
        public TestEnvironment()
        {
            RealtimeService = new SFMemoryRealtimeService();
            ParatextService = Substitute.For<IParatextService>();
            PTDDSyncRunner = Substitute.For<IPTDDSyncRunner>();
            SiteOptions = Substitute.For<IOptions<SiteOptions>>();
            SiteOptions.Value.Returns(new SiteOptions { SiteDir = "scriptureforge" });
            FileSystemService = Substitute.For<IFileSystemService>();
            Func<IPTDDSyncRunner> syncRunnerFactory = () => PTDDSyncRunner;

            var userSecrets = new MemoryRepository<UserSecret>(
                new[]
                {
                    new UserSecret
                    {
                        Id = "user01",
                        ParatextTokens = new Tokens
                        {
                            AccessToken = "test_access_token1",
                            RefreshToken = "test_refresh_token1"
                        }
                    },
                    new UserSecret
                    {
                        Id = "user03",
                        ParatextTokens = new Tokens
                        {
                            AccessToken = "test_access_token2",
                            RefreshToken = "test_refresh_token2"
                        }
                    }
                }
            );

            SetupSFData(true, true);

            Service = new CloneAllService(
                syncRunnerFactory,
                RealtimeService,
                SiteOptions,
                ParatextService,
                userSecrets,
                FileSystemService
            );
        }

        public CloneAllService Service { get; }
        public IParatextService ParatextService { get; }
        public SFMemoryRealtimeService RealtimeService { get; }
        public IOptions<SiteOptions> SiteOptions { get; }
        public IFileSystemService FileSystemService { get; }
        public IPTDDSyncRunner PTDDSyncRunner { get; }

        // The SetupSFData method was copied from ParatextSyncRunnerTests.cs, trimmed, and modified.
        public void SetupSFData(bool translationSuggestionsEnabled, bool checkingEnabled)
        {
            RealtimeService.AddRepository(
                "users",
                OTType.Json0,
                new MemoryRepository<User>(
                    new[]
                    {
                        new User { Id = "user01", ParatextId = "pt01" },
                        new User { Id = "user02", ParatextId = "pt02" },
                        new User { Id = "user03", ParatextId = "pt03" }
                    }
                )
            );
            RealtimeService.AddRepository(
                "sf_projects",
                OTType.Json0,
                new MemoryRepository<SFProject>(
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
                                { "user02", SFProjectRole.Translator },
                                { "user03", SFProjectRole.Administrator }
                            },
                            ParatextId = "target01",
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                                Source = new TranslateSource
                                {
                                    ParatextId = "source01",
                                    Name = "Source",
                                    ShortName = "SRC",
                                    WritingSystem = new WritingSystem { Tag = "en" }
                                }
                            },
                            CheckingConfig = new CheckingConfig { CheckingEnabled = checkingEnabled },
                            Sync = new Sync { QueuedCount = 1 }
                        },
                        new SFProject
                        {
                            Id = "project02",
                            Name = "project02",
                            ShortName = "P02",
                            UserRoles = new Dictionary<string, string>
                            {
                                { "user01", SFProjectRole.Administrator },
                                { "user02", SFProjectRole.Translator },
                                { "user03", SFProjectRole.Administrator }
                            },
                            ParatextId = "target02",
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = translationSuggestionsEnabled,
                                Source = new TranslateSource
                                {
                                    ParatextId = "source02",
                                    Name = "Source",
                                    ShortName = "SR2",
                                    WritingSystem = new WritingSystem { Tag = "en" }
                                }
                            },
                            CheckingConfig = new CheckingConfig { CheckingEnabled = checkingEnabled },
                            Sync = new Sync { QueuedCount = 1 }
                        }
                    }
                )
            );

            RealtimeService.AddRepository("texts", OTType.RichText, new MemoryRepository<TextData>());
            RealtimeService.AddRepository("questions", OTType.Json0, new MemoryRepository<Question>());
        }

        public async Task<IEnumerable<SFProject>> GetSFProjects(string[] sfProjectIds)
        {
            List<SFProject> projectsResults = new List<SFProject>();
            foreach (string id in sfProjectIds)
            {
                SFProject proj = await RealtimeService.GetSnapshotAsync<SFProject>(id);
                projectsResults.Add(proj);
            }
            return projectsResults;
        }
    }
}
