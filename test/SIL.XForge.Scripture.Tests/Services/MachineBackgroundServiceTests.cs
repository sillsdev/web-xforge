using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using NSubstitute;
using NUnit.Framework;
using Serval.Client;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;
using Options = Microsoft.Extensions.Options.Options;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class MachineBackgroundServiceTests
{
    [Test]
    public async Task ExecuteAsync_ExceptionThenTaskCanceled()
    {
        // Setup
        var env = new TestEnvironment();
        env.TranslationBuildsClient.When(x =>
                x.GetNextFinishedBuildAsync(Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            )
            .Do(_ =>
            {
                env.CancellationTokenSource.CancelAfter(50);
                throw ServalApiExceptions.InternalServerError;
            });

        // SUT
        await env.Service.RunExecuteAsync(env.CancellationTokenSource.Token);

        await env
            .MachineApiService.DidNotReceive()
            .ProcessBuildAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<JobState>(), Arg.Any<CancellationToken>());
        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception?.GetType() == typeof(ServalApiException));
    }

    [Test]
    public async Task ExecuteAsync_ExceptionWhenTaskCanceled()
    {
        // Setup
        var env = new TestEnvironment();
        env.TranslationBuildsClient.When(x =>
                x.GetNextFinishedBuildAsync(Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            )
            .Do(_ =>
            {
                env.CancellationTokenSource.Cancel();
                throw ServalApiExceptions.InternalServerError;
            });

        // SUT
        await env.Service.RunExecuteAsync(env.CancellationTokenSource.Token);

        await env
            .MachineApiService.DidNotReceive()
            .ProcessBuildAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<JobState>(), Arg.Any<CancellationToken>());
        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception?.GetType() == typeof(ServalApiException));
    }

    [Test]
    public async Task ExecuteAsync_FirstRunCreatesSiteConfig()
    {
        // Setup
        var env = new TestEnvironment();
        var build = env.ConfigureBuild(DateTimeOffset.Now);

        // Confirm initial environment
        long siteConfigCount = await env.SiteConfigs.CountDocumentsAsync(_ => true, CancellationToken.None);
        Assert.That(siteConfigCount, Is.Zero);

        // SUT
        await env.Service.RunExecuteAsync(env.CancellationTokenSource.Token);

        await env
            .MachineApiService.Received()
            .ProcessBuildAsync(build.Engine.Id, build.Id, build.State, Arg.Any<CancellationToken>());
        siteConfigCount = await env.SiteConfigs.CountDocumentsAsync(_ => true, CancellationToken.None);
        Assert.That(siteConfigCount, Is.EqualTo(1));
    }

    [Test]
    public async Task ExecuteAsync_HttpTimeout()
    {
        // Setup
        var env = new TestEnvironment();
        env.TranslationBuildsClient.When(x =>
                x.GetNextFinishedBuildAsync(Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            )
            .Do(_ =>
            {
                // Cancel the token so the next iteration of the loop wil exit
                env.CancellationTokenSource.Cancel();
                throw ServalApiExceptions.TimeOut;
            });

        // SUT
        await env.Service.RunExecuteAsync(env.CancellationTokenSource.Token);

        await env
            .MachineApiService.DidNotReceive()
            .ProcessBuildAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<JobState>(), Arg.Any<CancellationToken>());
        env.MockLogger.AssertNoEvent(_ => true);
    }

    [Test]
    public async Task ExecuteAsync_MissingDateFinished()
    {
        // Setup
        var env = new TestEnvironment();
        var build = env.ConfigureBuild(finished: null);

        // Confirm initial environment
        long siteConfigCount = await env.SiteConfigs.CountDocumentsAsync(_ => true, CancellationToken.None);
        Assert.That(siteConfigCount, Is.Zero);

        // SUT
        await env.Service.RunExecuteAsync(env.CancellationTokenSource.Token);

        await env
            .MachineApiService.Received()
            .ProcessBuildAsync(build.Engine.Id, build.Id, build.State, Arg.Any<CancellationToken>());
        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception?.GetType() == typeof(DataNotFoundException));

        // Confirm the site config was not modified
        siteConfigCount = await env.SiteConfigs.CountDocumentsAsync(_ => true, CancellationToken.None);
        Assert.That(siteConfigCount, Is.Zero);
    }

    [Test]
    public async Task ExecuteAsync_Success()
    {
        // Setup
        var env = new TestEnvironment();
        var build = env.ConfigureBuild(DateTimeOffset.Now);
        env.ConfigureSiteConfig();

        // SUT
        await env.Service.RunExecuteAsync(env.CancellationTokenSource.Token);

        await env
            .MachineApiService.Received()
            .ProcessBuildAsync(build.Engine.Id, build.Id, build.State, Arg.Any<CancellationToken>());
        long siteConfigCount = await env.SiteConfigs.CountDocumentsAsync(_ => true, CancellationToken.None);
        Assert.That(siteConfigCount, Is.EqualTo(1));
    }

    [Test]
    public async Task ExecuteAsync_TaskCanceled()
    {
        // Setup
        var env = new TestEnvironment();
        env.TranslationBuildsClient.When(x =>
                x.GetNextFinishedBuildAsync(Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            )
            .Do(_ => env.CancellationTokenSource.Cancel());

        // SUT
        await env.Service.RunExecuteAsync(env.CancellationTokenSource.Token);

        await env
            .MachineApiService.DidNotReceive()
            .ProcessBuildAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<JobState>(), Arg.Any<CancellationToken>());
    }

    [Test]
    public async Task ExecuteAsync_TaskCanceledDuringHttpRequest()
    {
        // Setup
        var env = new TestEnvironment();
        env.TranslationBuildsClient.When(x =>
                x.GetNextFinishedBuildAsync(Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            )
            .Do(_ => throw new TaskCanceledException());

        // SUT
        await env.Service.RunExecuteAsync(env.CancellationTokenSource.Token);

        await env
            .MachineApiService.DidNotReceive()
            .ProcessBuildAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<JobState>(), Arg.Any<CancellationToken>());
    }

    private class TestEnvironment
    {
        private const string SiteId = "SF";

        public TestEnvironment()
        {
            CancellationTokenSource = new CancellationTokenSource();
            IOptions<SiteOptions> options = Options.Create(new SiteOptions { Id = SiteId });
            MachineApiService = Substitute.For<IMachineApiService>();
            MachineApiService
                .When(x =>
                    x.ProcessBuildAsync(
                        Arg.Any<string>(),
                        Arg.Any<string>(),
                        Arg.Any<JobState>(),
                        Arg.Any<CancellationToken>()
                    )
                )
                .Do(_ => CancellationTokenSource.Cancel());
            MockLogger = new MockLogger<MachineBackgroundService>();
            SiteConfigs = new MemoryRepository<SiteConfig>();
            TranslationBuildsClient = Substitute.For<ITranslationBuildsClient>();

            ServiceCollection services = [];
            services.AddSingleton(MachineApiService);
            services.AddSingleton<IRepository<SiteConfig>>(SiteConfigs);
            services.AddSingleton(TranslationBuildsClient);
            IServiceProvider serviceProvider = services.BuildServiceProvider();

            Service = new MachineBackgroundService(options, MockLogger, serviceProvider);
        }

        public CancellationTokenSource CancellationTokenSource { get; }
        public IMachineApiService MachineApiService { get; }
        public MockLogger<MachineBackgroundService> MockLogger { get; }
        public MemoryRepository<SiteConfig> SiteConfigs { get; }
        public ITranslationBuildsClient TranslationBuildsClient { get; }
        public MachineBackgroundService Service { get; }

        public TranslationBuild ConfigureBuild(DateTimeOffset? finished)
        {
            var build = new TranslationBuild
            {
                Id = "build01",
                Engine = { Id = "translationEngine01" },
                State = JobState.Completed,
                DateFinished = finished,
            };
            TranslationBuildsClient
                .GetNextFinishedBuildAsync(Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
                .Returns(Task.FromResult(build));
            return build;
        }

        public void ConfigureSiteConfig() =>
            SiteConfigs.Add(
                new SiteConfig
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    LastFinishedBuild = DateTimeOffset.Now,
                    Name = SiteId,
                }
            );
    }
}
