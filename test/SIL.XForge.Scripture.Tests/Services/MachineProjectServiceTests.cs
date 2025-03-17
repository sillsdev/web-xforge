using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.FeatureManagement;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NSubstitute.Extensions;
using NUnit.Framework;
using Serval.Client;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class MachineProjectServiceTests
{
    private const string Paratext01 = "paratext01";
    private const string Paratext02 = "paratext02";
    private const string Paratext03 = "paratext03";
    private const string Paratext04 = "paratext04";
    private const string Paratext05 = "paratext05";
    private const string Project01 = "project01";
    private const string Project02 = "project02";
    private const string Project03 = "project03";
    private const string Project04 = "project04";
    private const string Project05 = "project05";
    private const string User01 = "user01";
    private const string Corpus01 = "corpus01";
    private const string Corpus02 = "corpus02";
    private const string Corpus03 = "corpus03";
    private const string Corpus04 = "corpus04";
    private const string Data01 = "data01";
    private const string File01 = "file01";
    private const string File02 = "file02";
    private const string File03 = "file03";
    private const string File04 = "file04";
    private const string File05 = "file05";
    private const string File06 = "file06";
    private const string Job01 = "job01";
    private const string ParallelCorpus01 = "parallelCorpus01";
    private const string ParallelCorpus02 = "parallelCorpus02";
    private const string ParallelCorpus03 = "parallelCorpus03";
    private const string TranslationEngine01 = "translationEngine01";
    private const string TranslationEngine02 = "translationEngine02";
    private const string LanguageTag = "he";

    [Test]
    public async Task AddSmtProjectAsync_DoesNotCreateIfLanguageMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        string actual = await env.Service.AddSmtProjectAsync(Project03, CancellationToken.None);
        Assert.IsEmpty(actual);
    }

    [Test]
    public void AddSmtProjectAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.AddSmtProjectAsync("invalid_project_id", CancellationToken.None)
        );
    }

    [Test]
    public async Task AddSmtProjectAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.Service.Configure()
            .CreateServalProjectAsync(Arg.Any<SFProject>(), preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult(TranslationEngine01));

        // SUT
        string actual = await env.Service.AddSmtProjectAsync(Project01, CancellationToken.None);
        Assert.AreEqual(TranslationEngine01, actual);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_DoesNotRecordBuildInProgressErrors()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.BuildInProgress;
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
            .ThrowsAsync(ex);

        // A pre-translation job has been queued
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData { PreTranslationJobId = Job01, PreTranslationQueuedAt = DateTime.UtcNow }
        );

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: true,
            CancellationToken.None
        );

        env.MockLogger.AssertNoEvent(logEvent => logEvent.Exception == ex);
        env.ExceptionHandler.DidNotReceiveWithAnyArgs().ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationErrorMessage);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationQueuedAt);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_DoesNotRecordBuildInProgressErrorsForSmt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.BuildInProgress;
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: false, CancellationToken.None)
            .ThrowsAsync(ex);

        // An SMT translation job has been queued
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData { TranslationJobId = Job01, TranslationQueuedAt = DateTime.UtcNow }
        );

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: false,
            CancellationToken.None
        );

        env.MockLogger.AssertNoEvent(logEvent => logEvent.Exception == ex);
        env.ExceptionHandler.DidNotReceiveWithAnyArgs().ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationErrorMessage);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationQueuedAt);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_DoesNotRecordTaskCancellation()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var ex = new TaskCanceledException();
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
            .ThrowsAsync(ex);

        // A pre-translation job has been queued
        await env.SetupProjectSecretAsync(Project01, new ServalData { PreTranslationQueuedAt = DateTime.UtcNow });

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: true,
            CancellationToken.None
        );

        env.ExceptionHandler.DidNotReceive().ReportException(Arg.Any<Exception>());
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_DoesNotRecordTaskCancellationForSmt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var ex = new TaskCanceledException();
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: false, CancellationToken.None)
            .ThrowsAsync(ex);

        // An SMT translation job has been queued
        await env.SetupProjectSecretAsync(Project01, new ServalData { TranslationQueuedAt = DateTime.UtcNow });

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: false,
            CancellationToken.None
        );

        env.ExceptionHandler.DidNotReceive().ReportException(Arg.Any<Exception>());
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_RecordsDataNotFoundExceptionAsWarning()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var ex = new DataNotFoundException("Not Found");
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
            .ThrowsAsync(ex);

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: true,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Warning);
        env.ExceptionHandler.DidNotReceive().ReportException(Arg.Any<Exception>());
    }

    public static async Task BuildProjectForBackgroundJobAsync_InvalidDataException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var ex = new InvalidDataException("Source project language not specified");
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
            .ThrowsAsync(ex);

        // A pre-translation job has been queued
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData { PreTranslationJobId = Job01, PreTranslationQueuedAt = DateTime.UtcNow }
        );

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: true,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Error);
        env.ExceptionHandler.Received(1).ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationQueuedAt);
        Assert.AreEqual(ex.Message, env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_RecordsErrors()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.Forbidden;
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
            .ThrowsAsync(ex);

        // A pre-translation job has been queued
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData { PreTranslationJobId = Job01, PreTranslationQueuedAt = DateTime.UtcNow }
        );

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: true,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Error);
        env.ExceptionHandler.Received(1).ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationQueuedAt);
        Assert.AreEqual(ex.Message, env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationErrorMessage);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_RecordsErrorsForSmt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.Forbidden;
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: false, CancellationToken.None)
            .ThrowsAsync(ex);

        // An SMT translation job has been queued
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData { TranslationJobId = Job01, TranslationQueuedAt = DateTime.UtcNow }
        );

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: false,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Error);
        env.ExceptionHandler.Received(1).ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationErrorMessage);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationQueuedAt);
        Assert.AreEqual(ex.Message, env.ProjectSecrets.Get(Project01).ServalData!.TranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_RunsBuildProjectAsync()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
            .Returns(Task.CompletedTask);

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            buildConfig,
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .Service.Received(1)
            .BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_PreTranslationBuild()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData
        {
            PreTranslationEngineId = TranslationEngine01,
            PreTranslationJobId = Job01,
            PreTranslationQueuedAt = DateTime.UtcNow,
        };
        await env.SetupProjectSecretAsync(Project01, servalData);
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .RemoveLegacyServalDataAsync(Project01, preTranslate: true, CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.Service.Configure()
            .EnsureTranslationEngineExistsAsync(
                User01,
                Arg.Any<IDocument<SFProject>>(),
                Arg.Any<SFProjectSecret>(),
                preTranslate: true,
                CancellationToken.None
            )
            .Returns(Task.FromResult(TranslationEngine01));
        env.Service.Configure()
            .RecreateTranslationEngineIfRequiredAsync(
                TranslationEngine01,
                Arg.Any<SFProject>(),
                preTranslate: true,
                CancellationToken.None
            )
            .Returns(Task.CompletedTask);
        env.Service.Configure()
            .SyncProjectCorporaAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult<IList<ServalCorpusSyncInfo>>([]));
        var translationBuildConfig = new TranslationBuildConfig();
        env.Service.Configure()
            .GetTranslationBuildConfig(
                Arg.Any<ServalData>(),
                servalConfig: null,
                buildConfig,
                Arg.Any<IList<ServalCorpusSyncInfo>>()
            )
            .Returns(translationBuildConfig);

        // SUT
        await env.Service.BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationQueuedAt);
        await env
            .TranslationEnginesClient.Received(1)
            .StartBuildAsync(TranslationEngine01, translationBuildConfig, CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_SmtTranslationBuild()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData
        {
            TranslationEngineId = TranslationEngine01,
            TranslationJobId = Job01,
            TranslationQueuedAt = DateTime.UtcNow,
        };
        await env.SetupProjectSecretAsync(Project01, servalData);
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .RemoveLegacyServalDataAsync(Project01, preTranslate: false, CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.Service.Configure()
            .EnsureTranslationEngineExistsAsync(
                User01,
                Arg.Any<IDocument<SFProject>>(),
                Arg.Any<SFProjectSecret>(),
                preTranslate: false,
                CancellationToken.None
            )
            .Returns(Task.FromResult(TranslationEngine01));
        env.Service.Configure()
            .RecreateTranslationEngineIfRequiredAsync(
                TranslationEngine01,
                Arg.Any<SFProject>(),
                preTranslate: false,
                CancellationToken.None
            )
            .Returns(Task.CompletedTask);
        env.Service.Configure()
            .SyncProjectCorporaAsync(User01, buildConfig, preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult<IList<ServalCorpusSyncInfo>>([]));

        // SUT
        await env.Service.BuildProjectAsync(User01, buildConfig, preTranslate: false, CancellationToken.None);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationQueuedAt);
        await env
            .TranslationEnginesClient.Received(1)
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_ThrowsExceptionWhenProjectMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.DeleteAllAsync(_ => true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.BuildProjectAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task BuildProjectAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.DeleteAllAsync(_ => true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.BuildProjectAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public void BuildProjectAsync_ThrowsExceptionWhenSourceProjectMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<InvalidDataException>(
            () =>
                env.Service.BuildProjectAsync(
                    User01,
                    new BuildConfig { ProjectId = Project04 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task BuildProjectAsync_ThrowsExceptionWhenServalDataMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, null);
        var buildConfig = new BuildConfig { ProjectId = Project01 };
        env.Service.Configure()
            .RemoveLegacyServalDataAsync(Project01, preTranslate: true, CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.Service.Configure()
            .EnsureTranslationEngineExistsAsync(
                User01,
                Arg.Any<IDocument<SFProject>>(),
                Arg.Any<SFProjectSecret>(),
                preTranslate: true,
                CancellationToken.None
            )
            .Returns(Task.FromResult(TranslationEngine01));
        env.Service.Configure()
            .RecreateTranslationEngineIfRequiredAsync(
                TranslationEngine01,
                Arg.Any<SFProject>(),
                preTranslate: true,
                CancellationToken.None
            )
            .Returns(Task.CompletedTask);
        env.Service.Configure()
            .SyncProjectCorporaAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult<IList<ServalCorpusSyncInfo>>([]));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.BuildProjectAsync(User01, buildConfig, preTranslate: true, CancellationToken.None)
        );
    }

    [Test]
    public async Task BuildProjectAsync_UsesTheServalConfigurationSpecifiedByTheServalAdmin()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string servalConfig = """{"max_steps":35}""";
        await env.Projects.UpdateAsync(
            Project01,
            op => op.Set(p => p.TranslateConfig.DraftConfig.ServalConfig, servalConfig)
        );

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            preTranslate: true,
            CancellationToken.None
        );
        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine01,
                Arg.Is<TranslationBuildConfig>(b => ((int)((JObject)b.Options)["max_steps"]) == 35),
                CancellationToken.None
            );
    }

    [Test]
    public async Task CreateOrUpdateParallelCorpusAsync_CreatesParallelCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        string actual = await env.Service.CreateOrUpdateParallelCorpusAsync(
            TranslationEngine01,
            null,
            string.Empty,
            [],
            [],
            CancellationToken.None
        );
        Assert.AreEqual(ParallelCorpus01, actual);
        await env
            .TranslationEnginesClient.Received(1)
            .AddParallelCorpusAsync(TranslationEngine01, Arg.Any<TranslationParallelCorpusConfig>());
    }

    [Test]
    public async Task CreateOrUpdateParallelCorpusAsync_RecreatesDeletedParallelCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetParallelCorpusAsync(
                TranslationEngine01,
                ParallelCorpus01,
                CancellationToken.None
            )
            .ThrowsAsync(ServalApiExceptions.NotFound);

        // SUT
        string actual = await env.Service.CreateOrUpdateParallelCorpusAsync(
            TranslationEngine01,
            ParallelCorpus01,
            string.Empty,
            [],
            [],
            CancellationToken.None
        );
        Assert.AreEqual(ParallelCorpus01, actual);
        await env
            .TranslationEnginesClient.Received(1)
            .AddParallelCorpusAsync(TranslationEngine01, Arg.Any<TranslationParallelCorpusConfig>());
    }

    [Test]
    public async Task CreateOrUpdateParallelCorpusAsync_UpdatesParallelCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetParallelCorpusAsync(
                TranslationEngine01,
                ParallelCorpus01,
                CancellationToken.None
            )
            .Returns(Task.FromResult(new TranslationParallelCorpus { Id = ParallelCorpus01 }));

        // SUT
        string actual = await env.Service.CreateOrUpdateParallelCorpusAsync(
            TranslationEngine01,
            ParallelCorpus01,
            string.Empty,
            [],
            [],
            CancellationToken.None
        );
        Assert.AreEqual(ParallelCorpus01, actual);
        await env
            .TranslationEnginesClient.Received(1)
            .UpdateParallelCorpusAsync(
                TranslationEngine01,
                ParallelCorpus01,
                Arg.Any<TranslationParallelCorpusUpdateConfig>()
            );
    }

    [Test]
    public async Task CreateServalProjectAsync_ExistingPreTranslationProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        await env.SetupProjectSecretAsync(Project01, new ServalData { PreTranslationEngineId = TranslationEngine01 });

        // SUT
        string actual = await env.Service.CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None);
        Assert.AreEqual(TranslationEngine01, actual);
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs().CreateAsync(Arg.Any<TranslationEngineConfig>());
    }

    [Test]
    public async Task CreateServalProjectAsync_ExistingServalDataInProjectSecretsForPreTranslation()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData());
        var project = new SFProject { Id = Project01 };
        env.Service.Configure().GetSourceLanguage(project).Returns("en");
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult("de"));
        env.TranslationEnginesClient.CreateAsync(Arg.Any<TranslationEngineConfig>())
            .Returns(Task.FromResult(new TranslationEngine { Id = TranslationEngine01 }));

        // SUT
        string actual = await env.Service.CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None);
        Assert.AreEqual(TranslationEngine01, actual);
        Assert.AreEqual(TranslationEngine01, env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationEngineId);
    }

    [Test]
    public async Task CreateServalProjectAsync_ExistingServalDataInProjectSecretsForSmtTranslation()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData());
        var project = new SFProject { Id = Project01 };
        env.Service.Configure().GetSourceLanguage(project).Returns("en");
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult("de"));
        env.TranslationEnginesClient.CreateAsync(Arg.Any<TranslationEngineConfig>())
            .Returns(Task.FromResult(new TranslationEngine { Id = TranslationEngine01 }));

        // SUT
        string actual = await env.Service.CreateServalProjectAsync(
            project,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.AreEqual(TranslationEngine01, actual);
        Assert.AreEqual(TranslationEngine01, env.ProjectSecrets.Get(Project01).ServalData?.TranslationEngineId);
    }

    [Test]
    public async Task CreateServalProjectAsync_ExistingSmtTranslationProject()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        await env.SetupProjectSecretAsync(Project01, new ServalData { TranslationEngineId = TranslationEngine01 });

        // SUT
        string actual = await env.Service.CreateServalProjectAsync(
            project,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.AreEqual(TranslationEngine01, actual);
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs().CreateAsync(Arg.Any<TranslationEngineConfig>());
    }

    [Test]
    public async Task CreateServalProjectAsync_NoServalDataInProjectSecretsForPreTranslation()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        env.Service.Configure().GetSourceLanguage(project).Returns("en");
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult("de"));
        env.TranslationEnginesClient.CreateAsync(Arg.Any<TranslationEngineConfig>())
            .Returns(Task.FromResult(new TranslationEngine { Id = TranslationEngine01 }));

        // SUT
        string actual = await env.Service.CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None);
        Assert.AreEqual(TranslationEngine01, actual);
        Assert.AreEqual(TranslationEngine01, env.ProjectSecrets.Get(Project01).ServalData?.PreTranslationEngineId);
    }

    [Test]
    public async Task CreateServalProjectAsync_NoServalDataInProjectSecretsForSmtTranslation()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        env.Service.Configure().GetSourceLanguage(project).Returns("en");
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult("de"));
        env.TranslationEnginesClient.CreateAsync(Arg.Any<TranslationEngineConfig>())
            .Returns(Task.FromResult(new TranslationEngine { Id = TranslationEngine01 }));

        // SUT
        string actual = await env.Service.CreateServalProjectAsync(
            project,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.AreEqual(TranslationEngine01, actual);
        Assert.AreEqual(TranslationEngine01, env.ProjectSecrets.Get(Project01).ServalData?.TranslationEngineId);
    }

    [Test]
    public void CreateServalProjectAsync_NoTranslationEngineIdFromServal()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        env.Service.Configure().GetSourceLanguage(project).Returns("en");
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult("de"));
        env.TranslationEnginesClient.CreateAsync(Arg.Any<TranslationEngineConfig>())
            .Returns(Task.FromResult(new TranslationEngine()));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None)
        );
    }

    [Test]
    public async Task CreateZipFileFromParatextDirectoryAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        MemoryStream outputStream = new MemoryStream();

        // SUT
        await env.Service.CreateZipFileFromParatextDirectoryAsync(Project01, outputStream, CancellationToken.None);

        // Validate the zip file
        outputStream.Seek(0, SeekOrigin.Begin);
        using var archive = new ZipArchive(outputStream, ZipArchiveMode.Read);
        Assert.AreEqual(1, archive.Entries.Count);
        Assert.AreEqual("file", archive.Entries[0].FullName);
    }

    [Test]
    public void CreateZipFileFromParatextDirectoryAsync_ThrowsExceptionWhenProjectDirectoryMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(false);
        MemoryStream outputStream = new MemoryStream();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CreateZipFileFromParatextDirectoryAsync(Project01, outputStream, CancellationToken.None)
        );
    }

    [Test]
    public async Task DeleteAllCorporaAndFilesAsync_DoesNotCrashWhenCorporaNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.NotFound;
        env.CorporaClient.DeleteAsync(Corpus01).ThrowsAsync(ex);

        // SUT
        await env.Service.DeleteAllCorporaAndFilesAsync(
            [new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 }],
            Project01,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Information
        );
    }

    [Test]
    public async Task DeleteAllCorporaAndFilesAsync_DoesNotCrashWhenFileNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.NotFound;
        env.DataFilesClient.DeleteAsync(File01).ThrowsAsync(ex);

        // SUT
        await env.Service.DeleteAllCorporaAndFilesAsync(
            [new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 }],
            Project01,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Information
        );
    }

    [Test]
    public async Task DeleteAllCorporaAndFilesAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.DeleteAllCorporaAndFilesAsync(
            [new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 }],
            Project01,
            CancellationToken.None
        );

        await env.CorporaClient.Received(1).DeleteAsync(Corpus01);
        await env.DataFilesClient.Received(1).DeleteAsync(File01);
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_PreTranslationEngineAlreadyExists()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { PreTranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(true));

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project01);
        await projectDoc.FetchAsync();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);

        // SUT
        string actual = await env.Service.EnsureTranslationEngineExistsAsync(
            User01,
            projectDoc,
            projectSecret,
            preTranslate: true,
            CancellationToken.None
        );
        Assert.AreEqual(TranslationEngine01, actual);
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_ProjectDeletedBeforeExecution()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { PreTranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(false));

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project01);
        await projectDoc.FetchAsync();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        await projectDoc.DeleteAsync();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.EnsureTranslationEngineExistsAsync(
                    User01,
                    projectDoc,
                    projectSecret,
                    preTranslate: true,
                    CancellationToken.None
                )
        );
        env.ParatextService.DidNotReceiveWithAnyArgs().GetWritingSystem(Arg.Any<UserSecret>(), Arg.Any<string>());
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_ProjectDeletedDuringExecution()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { PreTranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(false));

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project03);
        await projectDoc.FetchAsync();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        // Delete the project mid-sync (normally this would be done out of process)
        env.ParatextService.GetWritingSystem(Arg.Any<UserSecret>(), Arg.Any<string>())
            .Returns(new WritingSystem())
            .AndDoes(_ => projectDoc.DeleteAsync());

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.EnsureTranslationEngineExistsAsync(
                    User01,
                    projectDoc,
                    projectSecret,
                    preTranslate: true,
                    CancellationToken.None
                )
        );
        env.ParatextService.Received(1).GetWritingSystem(Arg.Any<UserSecret>(), Arg.Any<string>());
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_ProjectSourceRemoved()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { PreTranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(false));

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project03);
        await projectDoc.FetchAsync();
        await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.TranslateConfig.Source));
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        // SUT
        Assert.ThrowsAsync<InvalidDataException>(
            () =>
                env.Service.EnsureTranslationEngineExistsAsync(
                    User01,
                    projectDoc,
                    projectSecret,
                    preTranslate: true,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_SetsUpTheProjectAndTranslationEngineForPreTranslation()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string sourceLanguage = "en";
        const string targetLanguage = "fr";
        await env.SetupProjectSecretAsync(Project03, new ServalData { PreTranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project03, TranslationEngine01, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(false));
        env.Service.Configure()
            .CreateServalProjectAsync(Arg.Any<SFProject>(), preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(TranslationEngine02));
        env.ParatextService.GetWritingSystem(Arg.Any<UserSecret>(), Paratext01)
            .Returns(new WritingSystem { Tag = sourceLanguage });
        env.ParatextService.GetWritingSystem(Arg.Any<UserSecret>(), Paratext03)
            .Returns(new WritingSystem { Tag = targetLanguage });

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project03);
        await projectDoc.FetchAsync();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        // SUT
        string actual = await env.Service.EnsureTranslationEngineExistsAsync(
            User01,
            projectDoc,
            projectSecret,
            preTranslate: true,
            CancellationToken.None
        );
        Assert.AreEqual(TranslationEngine02, actual);
        Assert.IsNull(env.ProjectSecrets.Get(Project03).ServalData?.PreTranslationEngineId);
        Assert.AreEqual(sourceLanguage, env.Projects.Get(Project03).TranslateConfig.Source?.WritingSystem.Tag);
        Assert.AreEqual(targetLanguage, env.Projects.Get(Project03).WritingSystem.Tag);
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_SetsUpTheProjectAndTranslationEngineForSmtTranslation()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string sourceLanguage = "en";
        const string targetLanguage = "fr";
        await env.SetupProjectSecretAsync(Project03, new ServalData { TranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project03, TranslationEngine01, preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult(false));
        env.Service.Configure()
            .CreateServalProjectAsync(Arg.Any<SFProject>(), preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult(TranslationEngine02));
        env.ParatextService.GetWritingSystem(Arg.Any<UserSecret>(), Paratext01)
            .Returns(new WritingSystem { Tag = sourceLanguage });
        env.ParatextService.GetWritingSystem(Arg.Any<UserSecret>(), Paratext03)
            .Returns(new WritingSystem { Tag = targetLanguage });

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project03);
        await projectDoc.FetchAsync();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        // SUT
        string actual = await env.Service.EnsureTranslationEngineExistsAsync(
            User01,
            projectDoc,
            projectSecret,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.AreEqual(TranslationEngine02, actual);
        Assert.IsNull(env.ProjectSecrets.Get(Project03).ServalData?.TranslationEngineId);
        Assert.AreEqual(sourceLanguage, env.Projects.Get(Project03).TranslateConfig.Source?.WritingSystem.Tag);
        Assert.AreEqual(targetLanguage, env.Projects.Get(Project03).WritingSystem.Tag);
        Assert.IsFalse(env.Projects.Get(Project03).TranslateConfig.PreTranslate);
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_SmtTranslationEngineAlreadyExists()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { TranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult(true));

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project01);
        await projectDoc.FetchAsync();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);

        // SUT
        string actual = await env.Service.EnsureTranslationEngineExistsAsync(
            User01,
            projectDoc,
            projectSecret,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.AreEqual(TranslationEngine01, actual);
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_TranslationEngineCouldNotBeCreated()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { TranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(false));
        env.Service.Configure()
            .CreateServalProjectAsync(Arg.Any<SFProject>(), preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult<string?>(null));

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project01);
        await projectDoc.FetchAsync();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.EnsureTranslationEngineExistsAsync(
                    User01,
                    projectDoc,
                    projectSecret,
                    preTranslate: true,
                    CancellationToken.None
                )
        );
        env.ParatextService.DidNotReceiveWithAnyArgs().GetWritingSystem(Arg.Any<UserSecret>(), Arg.Any<string>());
    }

    [Test]
    public async Task EnsureTranslationEngineExistsAsync_UserSecretDoesNotExist()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { PreTranslationEngineId = TranslationEngine01 });
        env.Service.Configure()
            .TranslationEngineExistsAsync(Project01, TranslationEngine01, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(false));

        // Retrieve required objects
        await using IConnection connection = await env.RealtimeService.ConnectAsync();
        IDocument<SFProject> projectDoc = connection.Get<SFProject>(Project03);
        await projectDoc.FetchAsync();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.EnsureTranslationEngineExistsAsync(
                    "invalid_user_id",
                    projectDoc,
                    projectSecret,
                    preTranslate: true,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task GetCorpusIdFromServalAsync_Null()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        string actual = await env.Service.GetCorpusIdFromServalAsync(corpusId: null, CancellationToken.None);
        Assert.IsNull(actual);
    }

    [Test]
    public async Task GetCorpusIdFromServalAsync_Missing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.CorporaClient.GetAsync(Corpus01, CancellationToken.None).ThrowsAsync(ServalApiExceptions.NotFound);

        // SUT
        string actual = await env.Service.GetCorpusIdFromServalAsync(Corpus01, CancellationToken.None);
        Assert.IsNull(actual);
    }

    [Test]
    public async Task GetCorpusIdFromServalAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.CorporaClient.GetAsync(Corpus01, CancellationToken.None)
            .Returns(Task.FromResult(new Corpus { Id = Corpus01 }));

        // SUT
        string actual = await env.Service.GetCorpusIdFromServalAsync(Corpus01, CancellationToken.None);
        Assert.AreEqual(Corpus01, actual);
    }

    [Test]
    public async Task GetProjectZipAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        MemoryStream outputStream = new MemoryStream();
        env.Service.Configure()
            .CreateZipFileFromParatextDirectoryAsync(Paratext01, outputStream, CancellationToken.None)
            .Returns(Task.CompletedTask);

        // SUT
        string actual = await env.Service.GetProjectZipAsync(Project01, outputStream, CancellationToken.None);
        Assert.AreEqual("P01.zip", actual);
    }

    [Test]
    public void GetProjectZipAsync_ThrowsExceptionWhenProjectDocumentMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        MemoryStream outputStream = new MemoryStream();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetProjectZipAsync("invalid_project_id", outputStream, CancellationToken.None)
        );
    }

    [Test]
    public void GetProjectZipAsync_ThrowsExceptionWhenProjectIsAResource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.IsResource(Arg.Any<string>()).Returns(true);
        MemoryStream outputStream = new MemoryStream();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetProjectZipAsync(Project01, outputStream, CancellationToken.None)
        );
    }

    [Test]
    public void GetSourceLanguage_DoesNotUseTheAlternateSourceIfItIsDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string alternateSourceWritingSystemTag = "alternate_source_writing_system_tag";
        const string sourceWritingSystemTag = "source_writing_system_tag";
        var project = new SFProject
        {
            TranslateConfig =
            {
                DraftConfig = new DraftConfig
                {
                    AlternateSourceEnabled = false,
                    AlternateSource = new TranslateSource
                    {
                        WritingSystem = new WritingSystem { Tag = alternateSourceWritingSystemTag },
                    },
                },
                Source = new TranslateSource { WritingSystem = new WritingSystem { Tag = sourceWritingSystemTag } },
            },
        };

        // SUT
        string actual = env.Service.GetSourceLanguage(project);
        Assert.AreEqual(sourceWritingSystemTag, actual);
    }

    [Test]
    public void GetSourceLanguage_DoesNotUseTheAlternateSourceIfItsWritingTagIsEmpty()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string sourceWritingSystemTag = "source_writing_system_tag";
        var project = new SFProject
        {
            TranslateConfig =
            {
                DraftConfig = new DraftConfig { AlternateSourceEnabled = true, AlternateSource = null },
                Source = new TranslateSource { WritingSystem = new WritingSystem { Tag = sourceWritingSystemTag } },
            },
        };

        // SUT
        string actual = env.Service.GetSourceLanguage(project);
        Assert.AreEqual(sourceWritingSystemTag, actual);
    }

    [Test]
    public void GetSourceLanguage_ThrowsExceptionWhenProjectDoesNotHaveASource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { TranslateConfig = { Source = null } };

        // SUT
        Assert.Throws<InvalidDataException>(() => env.Service.GetSourceLanguage(project));
    }

    [Test]
    public void GetSourceLanguage_ThrowsExceptionWhenProjectNull()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.Throws<DataNotFoundException>(() => env.Service.GetSourceLanguage(null));
    }

    [Test]
    public void GetSourceLanguage_UsesTheAlternateSourceIfItIsEnabledAndConfigured()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string alternateSourceWritingSystemTag = "alternate_source_writing_system_tag";
        const string sourceWritingSystemTag = "source_writing_system_tag";
        var project = new SFProject
        {
            TranslateConfig =
            {
                DraftConfig = new DraftConfig
                {
                    AlternateSourceEnabled = true,
                    AlternateSource = new TranslateSource
                    {
                        WritingSystem = new WritingSystem { Tag = alternateSourceWritingSystemTag },
                    },
                },
                Source = new TranslateSource { WritingSystem = new WritingSystem { Tag = sourceWritingSystemTag } },
            },
        };

        // SUT
        string actual = env.Service.GetSourceLanguage(project);
        Assert.AreEqual(alternateSourceWritingSystemTag, actual);
    }

    [Test]
    public void GetSourceLanguage_ThrowsExceptionWhenTheSourceDoesNotHaveAWritingTag()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject
        {
            TranslateConfig = { Source = new TranslateSource { WritingSystem = new WritingSystem { Tag = null } } },
        };

        // SUT
        Assert.Throws<InvalidDataException>(() => env.Service.GetSourceLanguage(project));
    }

    [Test]
    public void GetTextFileData_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var text = TestEnvironment.GetMockTrainingData();
        const string expected = "001\ttarget\n003\tall flags\tss,ir,rs\n";

        // SUT
        string actual = env.Service.GetTextFileData(text);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public async Task GetTargetLanguageAsync_ReturnSourceIfEcho()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseEchoForPreTranslation = true });
        const string sourceWritingSystemTag = "source_writing_system_tag";
        var project = new SFProject();
        env.Service.Configure().GetSourceLanguage(project).Returns(sourceWritingSystemTag);

        // SUT
        string actual = await env.Service.GetTargetLanguageAsync(project);
        Assert.AreEqual(sourceWritingSystemTag, actual);
    }

    [Test]
    public async Task GetTargetLanguageAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string targetWritingSystemTag = "target_writing_system_tag";
        var project = new SFProject { WritingSystem = new WritingSystem { Tag = targetWritingSystemTag } };

        // SUT
        string actual = await env.Service.GetTargetLanguageAsync(project);
        Assert.AreEqual(targetWritingSystemTag, actual);
    }

    [Test]
    public void GetTranslationBuildConfig_DoesNotSpecifyAdditionalTrainingDataIfNoFilesSpecified()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData
        {
            ParallelCorpusIdForPreTranslate = ParallelCorpus01,
            ParallelCorpusIdForTrainOn = ParallelCorpus02,
            AdditionalTrainingData = new ServalAdditionalTrainingData { ParallelCorpusId = ParallelCorpus03 },
        };
        var buildConfig = new BuildConfig();

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig: null,
            buildConfig,
            corporaSyncInfo: []
        );
        Assert.IsTrue(actual.Pretranslate!.Any(c => c.ParallelCorpusId == ParallelCorpus01));
        Assert.IsTrue(actual.TrainOn!.Any(c => c.ParallelCorpusId == ParallelCorpus02));
        Assert.IsFalse(actual.TrainOn!.Any(c => c.ParallelCorpusId == ParallelCorpus03));
    }

    [Test]
    public void GetTranslationBuildConfig_MergesFastTrainingConfiguration()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData();
        const string servalConfig = """{"max_steps":35}""";
        var buildConfig = new BuildConfig { FastTraining = true };

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig,
            buildConfig,
            corporaSyncInfo: []
        );
        Assert.AreEqual(20, (int)(actual.Options as JObject)?["max_steps"]);
    }

    [Test]
    public void GetTranslationBuildConfig_NoScriptureRange()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData
        {
            ParallelCorpusIdForPreTranslate = ParallelCorpus01,
            ParallelCorpusIdForTrainOn = ParallelCorpus02,
        };
        var buildConfig = new BuildConfig();
        List<ServalCorpusSyncInfo> corporaSyncInfo =
        [
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus01,
                IsSource = true,
                ParallelCorpusId = ParallelCorpus01,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus02,
                IsSource = false,
                ParallelCorpusId = ParallelCorpus01,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus03,
                IsSource = true,
                ParallelCorpusId = ParallelCorpus02,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus04,
                IsSource = false,
                ParallelCorpusId = ParallelCorpus02,
            },
        ];

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig: null,
            buildConfig,
            corporaSyncInfo
        );
        Assert.IsNull(
            actual
                .Pretranslate!.Single(c => c.ParallelCorpusId == ParallelCorpus01)
                .SourceFilters!.Single(f => f.CorpusId == Corpus01)
                .ScriptureRange
        );
        Assert.IsNull(
            actual
                .TrainOn!.Single(c => c.ParallelCorpusId == ParallelCorpus02)
                .SourceFilters!.Single(f => f.CorpusId == Corpus03)
                .ScriptureRange
        );
        Assert.IsNull(
            actual
                .TrainOn!.Single(c => c.ParallelCorpusId == ParallelCorpus02)
                .TargetFilters!.Single(f => f.CorpusId == Corpus04)
                .ScriptureRange
        );
    }

    [Test]
    public void GetTranslationBuildConfig_PassesFastTrainingConfiguration()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData();
        var buildConfig = new BuildConfig { FastTraining = true };

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig: null,
            buildConfig,
            corporaSyncInfo: []
        );
        Assert.AreEqual(20, (int)(actual.Options as JObject)?["max_steps"]);
    }

    [Test]
    public void GetTranslationBuildConfig_PassesServalConfig()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData();
        const string servalConfig = """{"max_steps":35}""";
        var buildConfig = new BuildConfig();

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig,
            buildConfig,
            corporaSyncInfo: []
        );
        Assert.AreEqual(35, (int)(actual.Options as JObject)?["max_steps"]);
    }

    [Test]
    public void GetTranslationBuildConfig_ScriptureRangeAsString()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData
        {
            ParallelCorpusIdForPreTranslate = ParallelCorpus01,
            ParallelCorpusIdForTrainOn = ParallelCorpus02,
        };
        const string trainingScriptureRange = "MAT;MRK";
        const string translationScriptureRange = "LUK;JHN";
        var buildConfig = new BuildConfig
        {
            TrainingScriptureRange = trainingScriptureRange,
            TranslationScriptureRange = translationScriptureRange,
        };
        List<ServalCorpusSyncInfo> corporaSyncInfo =
        [
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus01,
                IsSource = true,
                ParallelCorpusId = ParallelCorpus01,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus02,
                IsSource = false,
                ParallelCorpusId = ParallelCorpus01,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus03,
                IsSource = true,
                ParallelCorpusId = ParallelCorpus02,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus04,
                IsSource = false,
                ParallelCorpusId = ParallelCorpus02,
            },
        ];

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig: null,
            buildConfig,
            corporaSyncInfo
        );
        Assert.AreEqual(
            translationScriptureRange,
            actual
                .Pretranslate!.Single(c => c.ParallelCorpusId == ParallelCorpus01)
                .SourceFilters!.Single(f => f.CorpusId == Corpus01)
                .ScriptureRange
        );
        Assert.AreEqual(
            trainingScriptureRange,
            actual
                .TrainOn!.Single(c => c.ParallelCorpusId == ParallelCorpus02)
                .SourceFilters!.Single(f => f.CorpusId == Corpus03)
                .ScriptureRange
        );
        Assert.AreEqual(
            trainingScriptureRange,
            actual
                .TrainOn!.Single(c => c.ParallelCorpusId == ParallelCorpus02)
                .TargetFilters!.Single(f => f.CorpusId == Corpus04)
                .ScriptureRange
        );
    }

    [Test]
    public void GetTranslationBuildConfig_SpecifiesAdditionalTrainingData()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData
        {
            ParallelCorpusIdForPreTranslate = ParallelCorpus01,
            ParallelCorpusIdForTrainOn = ParallelCorpus02,
            AdditionalTrainingData = new ServalAdditionalTrainingData { ParallelCorpusId = ParallelCorpus03 },
        };
        var buildConfig = new BuildConfig { TrainingDataFiles = [Data01] };

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig: null,
            buildConfig,
            corporaSyncInfo: []
        );
        Assert.IsTrue(actual.Pretranslate!.Any(c => c.ParallelCorpusId == ParallelCorpus01));
        Assert.IsTrue(actual.TrainOn!.Any(c => c.ParallelCorpusId == ParallelCorpus02));
        Assert.IsTrue(actual.TrainOn!.Any(c => c.ParallelCorpusId == ParallelCorpus03));
    }

    [Test]
    public void GetTranslationBuildConfig_TranslationBooksAndTrainingBooks()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData
        {
            ParallelCorpusIdForPreTranslate = ParallelCorpus01,
            ParallelCorpusIdForTrainOn = ParallelCorpus02,
        };
        // The training and translation books will correspond to these two strings
        const string trainingScriptureRange = "MAT;MRK";
        const string translationScriptureRange = "LUK;JHN";
        var buildConfig = new BuildConfig { TrainingBooks = [40, 41], TranslationBooks = [42, 43] };
        List<ServalCorpusSyncInfo> corporaSyncInfo =
        [
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus01,
                IsSource = true,
                ParallelCorpusId = ParallelCorpus01,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus02,
                IsSource = false,
                ParallelCorpusId = ParallelCorpus01,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus03,
                IsSource = true,
                ParallelCorpusId = ParallelCorpus02,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus04,
                IsSource = false,
                ParallelCorpusId = ParallelCorpus02,
            },
        ];

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig: null,
            buildConfig,
            corporaSyncInfo
        );
        Assert.AreEqual(
            translationScriptureRange,
            actual
                .Pretranslate!.Single(c => c.ParallelCorpusId == ParallelCorpus01)
                .SourceFilters!.Single(f => f.CorpusId == Corpus01)
                .ScriptureRange
        );
        Assert.AreEqual(
            trainingScriptureRange,
            actual
                .TrainOn!.Single(c => c.ParallelCorpusId == ParallelCorpus02)
                .SourceFilters!.Single(f => f.CorpusId == Corpus03)
                .ScriptureRange
        );
        Assert.AreEqual(
            trainingScriptureRange,
            actual
                .TrainOn!.Single(c => c.ParallelCorpusId == ParallelCorpus02)
                .TargetFilters!.Single(f => f.CorpusId == Corpus04)
                .ScriptureRange
        );
    }

    [Test]
    public void GetTranslationBuildConfig_TranslationScriptureRangesAndTrainingScriptureRanges()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalData = new ServalData
        {
            ParallelCorpusIdForPreTranslate = ParallelCorpus01,
            ParallelCorpusIdForTrainOn = ParallelCorpus02,
        };
        // The training and translation books will correspond to these two strings
        const string project01ScriptureRange = "MAT;MRK";
        // No scripture range is supported for target pre-translate translation (project02)
        const string project03ScriptureRange = "LUK;JHN";
        const string project04ScriptureRange = "ACT;ROM";
        var buildConfig = new BuildConfig
        {
            TranslationScriptureRanges =
            [
                new ProjectScriptureRange { ProjectId = Project01, ScriptureRange = project01ScriptureRange },
            ],
            TrainingScriptureRanges =
            [
                new ProjectScriptureRange { ProjectId = Project03, ScriptureRange = project03ScriptureRange },
                new ProjectScriptureRange { ProjectId = Project04, ScriptureRange = project04ScriptureRange },
            ],
        };
        List<ServalCorpusSyncInfo> corporaSyncInfo =
        [
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus01,
                IsSource = true,
                ParallelCorpusId = ParallelCorpus01,
                ProjectId = Project01,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus02,
                IsSource = false,
                ParallelCorpusId = ParallelCorpus01,
                ProjectId = Project02,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus03,
                IsSource = true,
                ParallelCorpusId = ParallelCorpus02,
                ProjectId = Project03,
            },
            new ServalCorpusSyncInfo
            {
                CorpusId = Corpus04,
                IsSource = false,
                ParallelCorpusId = ParallelCorpus02,
                ProjectId = Project04,
            },
        ];

        // SUT
        TranslationBuildConfig actual = env.Service.GetTranslationBuildConfig(
            servalData,
            servalConfig: null,
            buildConfig,
            corporaSyncInfo
        );
        Assert.AreEqual(
            project01ScriptureRange,
            actual
                .Pretranslate!.Single(c => c.ParallelCorpusId == ParallelCorpus01)
                .SourceFilters!.Single(f => f.CorpusId == Corpus01)
                .ScriptureRange
        );
        Assert.AreEqual(
            project03ScriptureRange,
            actual
                .TrainOn!.Single(c => c.ParallelCorpusId == ParallelCorpus02)
                .SourceFilters!.Single(f => f.CorpusId == Corpus03)
                .ScriptureRange
        );
        Assert.AreEqual(
            project04ScriptureRange,
            actual
                .TrainOn!.Single(c => c.ParallelCorpusId == ParallelCorpus02)
                .TargetFilters!.Single(f => f.CorpusId == Corpus04)
                .ScriptureRange
        );
    }

    [Test]
    public async Task GetTranslationEngineTypeAsync_Echo()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseEchoForPreTranslation = true });

        // SUT
        var actual = await env.Service.GetTranslationEngineTypeAsync(preTranslate: true);
        Assert.AreEqual(MachineProjectService.Echo, actual);
    }

    [Test]
    public async Task GetTranslationEngineTypeAsync_Nmt()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        var actual = await env.Service.GetTranslationEngineTypeAsync(preTranslate: true);
        Assert.AreEqual(MachineProjectService.Nmt, actual);
    }

    [Test]
    public async Task GetTranslationEngineTypeAsync_Smt()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        var actual = await env.Service.GetTranslationEngineTypeAsync(preTranslate: false);
        Assert.AreEqual(MachineProjectService.SmtTransfer, actual);
    }

    [Test]
    public async Task RecreateTranslationEngineIfRequiredAsync_DoNotRecreateIfNoLanguageChanges()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        const string targetLanguage = "en";
        const string sourceLanguage = "de";
        env.Service.Configure().GetSourceLanguage(project).Returns(sourceLanguage);
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult(targetLanguage));
        env.Service.Configure()
            .CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(string.Empty));
        env.Service.Configure()
            .RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.TranslationEnginesClient.GetAsync(TranslationEngine01)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        SourceLanguage = sourceLanguage,
                        TargetLanguage = targetLanguage,
                    }
                )
            );

        // SUT
        await env.Service.RecreateTranslationEngineIfRequiredAsync(
            TranslationEngine01,
            project,
            preTranslate: true,
            CancellationToken.None
        );
        await env
            .Service.DidNotReceiveWithAnyArgs()
            .RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None);
        await env
            .Service.DidNotReceiveWithAnyArgs()
            .CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None);
    }

    [Test]
    public async Task RecreateTranslationEngineIfRequiredAsync_RecreateIfTheSourceLanguageChanges()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        const string targetLanguage = "en";
        const string oldSourceLanguage = "de";
        const string newSourceLanguage = "fr";
        env.Service.Configure().GetSourceLanguage(project).Returns(oldSourceLanguage);
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult(targetLanguage));
        env.Service.Configure()
            .CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(string.Empty));
        env.Service.Configure()
            .RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.TranslationEnginesClient.GetAsync(TranslationEngine01)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        SourceLanguage = newSourceLanguage,
                        TargetLanguage = targetLanguage,
                    }
                )
            );

        // SUT
        await env.Service.RecreateTranslationEngineIfRequiredAsync(
            TranslationEngine01,
            project,
            preTranslate: true,
            CancellationToken.None
        );
        await env.Service.Received(1).RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None);
        await env.Service.Received(1).CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None);
    }

    [Test]
    public async Task RecreateTranslationEngineIfRequiredAsync_RecreateIfTheTargetLanguageChanges()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        const string oldTargetLanguage = "en";
        const string newTargetLanguage = "fr";
        const string sourceLanguage = "de";
        env.Service.Configure().GetSourceLanguage(project).Returns(sourceLanguage);
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult(newTargetLanguage));
        env.Service.Configure()
            .CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(string.Empty));
        env.Service.Configure()
            .RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.TranslationEnginesClient.GetAsync(TranslationEngine01)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        SourceLanguage = sourceLanguage,
                        TargetLanguage = oldTargetLanguage,
                    }
                )
            );

        // SUT
        await env.Service.RecreateTranslationEngineIfRequiredAsync(
            TranslationEngine01,
            project,
            preTranslate: true,
            CancellationToken.None
        );
        await env.Service.Received(1).RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None);
        await env.Service.Received(1).CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None);
    }

    [Test]
    public async Task RecreateTranslationEngineIfRequiredAsync_RecreatePreTranslationEngineIfNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { PreTranslationEngineId = TranslationEngine01 });
        var project = new SFProject { Id = Project01 };
        ServalApiException ex = ServalApiExceptions.NotFound;
        env.Service.Configure()
            .CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None)
            .Returns(Task.FromResult(string.Empty));
        env.TranslationEnginesClient.GetAsync(TranslationEngine01).ThrowsAsync(ex);

        // SUT
        await env.Service.RecreateTranslationEngineIfRequiredAsync(
            TranslationEngine01,
            project,
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.PreTranslationEngineId);
        await env.Service.Received(1).CreateServalProjectAsync(project, preTranslate: true, CancellationToken.None);
        env.MockLogger.AssertHasEvent(l => l.Exception == ex && l.LogLevel == LogLevel.Information);
    }

    [Test]
    public async Task RecreateTranslationEngineIfRequiredAsync_RecreateSmtTranslationEngineIfNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(Project01, new ServalData { TranslationEngineId = TranslationEngine01 });
        var project = new SFProject { Id = Project01 };
        ServalApiException ex = ServalApiExceptions.NotFound;
        env.Service.Configure()
            .CreateServalProjectAsync(project, preTranslate: false, CancellationToken.None)
            .Returns(Task.FromResult(string.Empty));
        env.TranslationEnginesClient.GetAsync(TranslationEngine01).ThrowsAsync(ex);

        // SUT
        await env.Service.RecreateTranslationEngineIfRequiredAsync(
            TranslationEngine01,
            project,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsNull(env.ProjectSecrets.Get(Project01).ServalData!.TranslationEngineId);
        await env.Service.Received(1).CreateServalProjectAsync(project, preTranslate: false, CancellationToken.None);
        env.MockLogger.AssertHasEvent(l => l.Exception == ex && l.LogLevel == LogLevel.Information);
    }

    [Test]
    public async Task RemoveLegacyServalDataAsync_DoesNotCallServalIfNoTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveLegacyServalDataAsync(Project01, preTranslate: false, CancellationToken.None);

        // Ensure that the corpus and its files were not deleted
        await env
            .TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(TranslationEngine01, Corpus01, deleteFiles: true, CancellationToken.None);
    }

    [Test]
    public async Task RemoveLegacyServalDataAsync_LogsAnErrorWhenAServalErrorOccurs()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { HasTranslationEngineForSmt = true, LegacyCorpora = true }
        );
        env.TranslationEnginesClient.DeleteCorpusAsync(
                TranslationEngine02,
                Corpus01,
                deleteFiles: true,
                CancellationToken.None
            )
            .ThrowsAsync(ServalApiExceptions.InternalServerError);

        // SUT
        await env.Service.RemoveLegacyServalDataAsync(Project02, preTranslate: false, CancellationToken.None);

        // Ensure that the corpus and its files were deleted
        env.MockLogger.AssertHasEvent(l => l.LogLevel == LogLevel.Error && l.Message!.Contains(TranslationEngine02));
    }

    [Test]
    public async Task RemoveLegacyServalDataAsync_LogsAnEventWhenTheFileIsNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { HasTranslationEngineForSmt = true, LegacyCorpora = true }
        );
        env.TranslationEnginesClient.DeleteCorpusAsync(
                TranslationEngine02,
                Corpus01,
                deleteFiles: true,
                CancellationToken.None
            )
            .ThrowsAsync(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.RemoveLegacyServalDataAsync(Project02, preTranslate: false, CancellationToken.None);

        // Ensure that the corpus and its files were deleted
        env.MockLogger.AssertHasEvent(l =>
            l.LogLevel == LogLevel.Information && l.Message!.Contains(TranslationEngine02)
        );
    }

    [Test]
    public async Task RemoveLegacyServalDataAsync_OnlyRemovesRelevantCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { HasTranslationEngineForSmt = true, LegacyCorpora = true }
        );

        // Verify there are two corpora
        Assert.AreEqual(2, env.ProjectSecrets.Get(Project02).ServalData!.Corpora!.Count);

        // SUT
        await env.Service.RemoveLegacyServalDataAsync(Project02, preTranslate: false, CancellationToken.None);

        // Ensure that the corpus and its files were deleted
        await env
            .TranslationEnginesClient.Received(1)
            .DeleteCorpusAsync(TranslationEngine02, Corpus01, deleteFiles: true, CancellationToken.None);
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData!.Corpora!.Count);
    }

    [Test]
    public async Task RemoveLegacyServalDataAsync_RemovesCorporaPropertyIfNoMoreCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { LegacyCorpora = true });
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            uploadParatextZipFile: true,
            alternateTrainingSource: true
        );

        // Verify there are two corpora
        Assert.AreEqual(2, env.ProjectSecrets.Get(Project02).ServalData!.Corpora!.Count);

        // SUT
        await env.Service.RemoveLegacyServalDataAsync(Project02, preTranslate: true, CancellationToken.None);

        // Ensure that the corpus and its files were deleted
        await env
            .TranslationEnginesClient.Received(1)
            .DeleteCorpusAsync(TranslationEngine02, Corpus01, deleteFiles: true, CancellationToken.None);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData?.Corpora);
    }

    [Test]
    public void RemoveLegacyServalDataAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.RemoveLegacyServalDataAsync(
                    "invalid_project_id",
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task RemoveProjectAsync_DeletesPreTranslationEngineAndAllCorporaAndFilesIfNoSmt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData
            {
                PreTranslationEngineId = TranslationEngine01,
                ParallelCorpusIdForPreTranslate = ParallelCorpus01,
                ParallelCorpusIdForTrainOn = ParallelCorpus02,
                PreTranslationsRetrieved = true,
                CorpusFiles =
                [
                    new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 },
                    new ServalCorpusFile { CorpusId = Corpus02, FileId = File02 },
                ],
                AdditionalTrainingData = new ServalAdditionalTrainingData
                {
                    SourceCorpusId = Corpus03,
                    TargetCorpusId = Corpus04,
                    CorpusFiles =
                    [
                        new ServalCorpusFile { CorpusId = Corpus03, FileId = File03 },
                        new ServalCorpusFile { CorpusId = Corpus04, FileId = File04 },
                    ],
                },
            }
        );

        // SUT
        await env.Service.RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None);

        // Ensure that the pre-translation engine, additional training corpora and files are deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine01);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus01);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus02);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus03);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus04);
        await env.DataFilesClient.Received(1).DeleteAsync(File01);
        await env.DataFilesClient.Received(1).DeleteAsync(File02);
        await env.DataFilesClient.Received(1).DeleteAsync(File03);
        await env.DataFilesClient.Received(1).DeleteAsync(File04);

        // Verify that the project secret is correct
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        Assert.IsNull(projectSecret.ServalData!.AdditionalTrainingData);
        Assert.IsNull(projectSecret.ServalData!.PreTranslationEngineId);
        Assert.IsNull(projectSecret.ServalData!.PreTranslationsRetrieved);
        Assert.IsNull(projectSecret.ServalData!.ParallelCorpusIdForPreTranslate);
        Assert.IsNull(projectSecret.ServalData!.ParallelCorpusIdForTrainOn);
        Assert.IsEmpty(projectSecret.ServalData!.CorpusFiles);
    }

    [Test]
    public async Task RemoveProjectAsync_DeletesPreTranslationEngineOnly()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData
            {
                PreTranslationEngineId = TranslationEngine01,
                ParallelCorpusIdForPreTranslate = ParallelCorpus01,
                ParallelCorpusIdForTrainOn = ParallelCorpus02,
                PreTranslationsRetrieved = true,
                TranslationEngineId = TranslationEngine02,
                ParallelCorpusIdForSmt = ParallelCorpus03,
                CorpusFiles =
                [
                    new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 },
                    new ServalCorpusFile { CorpusId = Corpus02, FileId = File02 },
                ],
                AdditionalTrainingData = new ServalAdditionalTrainingData
                {
                    SourceCorpusId = Corpus03,
                    TargetCorpusId = Corpus04,
                    CorpusFiles =
                    [
                        new ServalCorpusFile { CorpusId = Corpus03, FileId = File03 },
                        new ServalCorpusFile { CorpusId = Corpus03, FileId = File04 },
                        new ServalCorpusFile { CorpusId = Corpus04, FileId = File05 },
                        new ServalCorpusFile { CorpusId = Corpus04, FileId = File06 },
                    ],
                },
            }
        );

        // SUT
        await env.Service.RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None);

        // Ensure that the pre-translation engine, additional training corpora and files are deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine01);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus03);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus04);
        await env.DataFilesClient.Received(1).DeleteAsync(File03);
        await env.DataFilesClient.Received(1).DeleteAsync(File04);
        await env.DataFilesClient.Received(1).DeleteAsync(File05);
        await env.DataFilesClient.Received(1).DeleteAsync(File06);

        // Ensure that the SMT translation engine, shared corpora, and shared files are not deleted
        await env.TranslationEnginesClient.DidNotReceive().DeleteAsync(TranslationEngine02);
        await env.CorporaClient.DidNotReceive().DeleteAsync(Corpus01);
        await env.CorporaClient.DidNotReceive().DeleteAsync(Corpus02);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File01);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File02);

        // Verify that the project secret is correct
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        Assert.IsNull(projectSecret.ServalData!.AdditionalTrainingData);
        Assert.IsNull(projectSecret.ServalData!.PreTranslationEngineId);
        Assert.IsNull(projectSecret.ServalData!.PreTranslationsRetrieved);
        Assert.IsNull(projectSecret.ServalData!.ParallelCorpusIdForPreTranslate);
        Assert.IsNull(projectSecret.ServalData!.ParallelCorpusIdForTrainOn);
        Assert.IsNotEmpty(projectSecret.ServalData!.CorpusFiles);
        Assert.AreEqual(TranslationEngine02, projectSecret.ServalData!.TranslationEngineId);
        Assert.AreEqual(ParallelCorpus03, projectSecret.ServalData!.ParallelCorpusIdForSmt);
    }

    [Test]
    public async Task RemoveProjectAsync_DeletesTranslationEngineAndAllCorporaAndFilesIfNoNmt()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData
            {
                TranslationEngineId = TranslationEngine02,
                ParallelCorpusIdForSmt = ParallelCorpus03,
                CorpusFiles =
                [
                    new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 },
                    new ServalCorpusFile { CorpusId = Corpus02, FileId = File02 },
                ],
            }
        );

        // SUT
        await env.Service.RemoveProjectAsync(Project01, preTranslate: false, CancellationToken.None);

        // Ensure that the SMT translation engine, shared corpora, and shared files are not deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine02);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus01);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus02);
        await env.DataFilesClient.Received(1).DeleteAsync(File01);
        await env.DataFilesClient.Received(1).DeleteAsync(File02);

        // Verify that the project secret is correct
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        Assert.IsEmpty(projectSecret.ServalData!.CorpusFiles);
        Assert.IsNull(projectSecret.ServalData!.TranslationEngineId);
        Assert.IsNull(projectSecret.ServalData!.ParallelCorpusIdForSmt);
    }

    [Test]
    public async Task RemoveProjectAsync_DeletesTranslationEngineOnly()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData
            {
                PreTranslationEngineId = TranslationEngine01,
                ParallelCorpusIdForPreTranslate = ParallelCorpus01,
                ParallelCorpusIdForTrainOn = ParallelCorpus02,
                PreTranslationsRetrieved = true,
                TranslationEngineId = TranslationEngine02,
                ParallelCorpusIdForSmt = ParallelCorpus03,
                CorpusFiles =
                [
                    new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 },
                    new ServalCorpusFile { CorpusId = Corpus02, FileId = File02 },
                ],
                AdditionalTrainingData = new ServalAdditionalTrainingData
                {
                    SourceCorpusId = Corpus03,
                    TargetCorpusId = Corpus04,
                    CorpusFiles =
                    [
                        new ServalCorpusFile { CorpusId = Corpus03, FileId = File03 },
                        new ServalCorpusFile { CorpusId = Corpus03, FileId = File04 },
                        new ServalCorpusFile { CorpusId = Corpus04, FileId = File05 },
                        new ServalCorpusFile { CorpusId = Corpus04, FileId = File06 },
                    ],
                },
            }
        );

        // SUT
        await env.Service.RemoveProjectAsync(Project01, preTranslate: false, CancellationToken.None);

        // Ensure that the SMT translation engine, shared corpora, and shared files are not deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine02);

        // Ensure that the pre-translation engine, and any additional or shared corpora and files are not deleted
        await env.TranslationEnginesClient.DidNotReceive().DeleteAsync(TranslationEngine01);
        await env.CorporaClient.DidNotReceive().DeleteAsync(Corpus01);
        await env.CorporaClient.DidNotReceive().DeleteAsync(Corpus02);
        await env.CorporaClient.DidNotReceive().DeleteAsync(Corpus03);
        await env.CorporaClient.DidNotReceive().DeleteAsync(Corpus04);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File01);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File02);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File03);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File04);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File05);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File06);

        // Verify that the project secret is correct
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        Assert.IsNotNull(projectSecret.ServalData!.AdditionalTrainingData);
        Assert.AreEqual(TranslationEngine01, projectSecret.ServalData!.PreTranslationEngineId);
        Assert.IsTrue(projectSecret.ServalData!.PreTranslationsRetrieved);
        Assert.AreEqual(ParallelCorpus01, projectSecret.ServalData!.ParallelCorpusIdForPreTranslate);
        Assert.AreEqual(ParallelCorpus02, projectSecret.ServalData!.ParallelCorpusIdForTrainOn);
        Assert.IsNotEmpty(projectSecret.ServalData!.CorpusFiles);
        Assert.IsNull(projectSecret.ServalData!.TranslationEngineId);
        Assert.IsNull(projectSecret.ServalData!.ParallelCorpusIdForSmt);
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotCallServalIfNoTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveProjectAsync(Project01, preTranslate: false, CancellationToken.None);

        // Ensure that the translation engine, corpus and any files were not deleted
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs().DeleteAsync(TranslationEngine01);
        await env.CorporaClient.DidNotReceiveWithAnyArgs().DeleteAsync(Corpus01);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(File01);

        // A message was logged about the missing translation engine
        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.LogLevel == LogLevel.Information && logEvent.Message!.Contains("No Translation Engine Id")
        );
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotThrowExceptionWhenTheCorpusIsNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData
            {
                PreTranslationEngineId = TranslationEngine01,
                CorpusFiles = [new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 }],
            }
        );

        // Make the Serval API return the error code for an already deleted translation engine
        env.CorporaClient.DeleteAsync(Corpus01).Throws(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None);

        // Ensure that the translation engine, shared corpora, and shared files are not deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine01);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus01);
        await env.DataFilesClient.Received(1).DeleteAsync(File01);

        // The 404 exception was logged
        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.LogLevel == LogLevel.Information && logEvent.Exception is ServalApiException
        );
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotThrowExceptionWhenTheFileIsNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData
            {
                PreTranslationEngineId = TranslationEngine01,
                CorpusFiles = [new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 }],
            }
        );

        // Make the Serval API return the error code for an already deleted translation engine
        env.DataFilesClient.DeleteAsync(File01).Throws(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None);

        // Ensure that the translation engine, shared corpora, and shared files are not deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine01);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus01);
        await env.DataFilesClient.Received(1).DeleteAsync(File01);

        // The 404 exception was logged
        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.LogLevel == LogLevel.Information && logEvent.Exception is ServalApiException
        );
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotThrowExceptionWhenTheTranslationEngineIsNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupProjectSecretAsync(
            Project01,
            new ServalData
            {
                PreTranslationEngineId = TranslationEngine01,
                CorpusFiles = [new ServalCorpusFile { CorpusId = Corpus01, FileId = File01 }],
            }
        );

        // Make the Serval API return the error code for an already deleted translation engine
        env.TranslationEnginesClient.DeleteAsync(TranslationEngine01).Throws(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.RemoveProjectAsync(Project01, preTranslate: true, CancellationToken.None);

        // Ensure that the translation engine, shared corpora, and shared files are not deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine01);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus01);
        await env.DataFilesClient.Received(1).DeleteAsync(File01);

        // The 404 exception was logged
        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.LogLevel == LogLevel.Information && logEvent.Exception is ServalApiException
        );
    }

    [Test]
    public void RemoveProjectAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.RemoveProjectAsync("invalid_project_id", preTranslate: false, CancellationToken.None)
        );
    }

    [Test]
    public async Task SyncAdditionalTrainingData_RemoveAdditionalTrainingDataWithoutParallelCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        var buildConfig = new BuildConfig();
        var additionalTrainingData = new ServalAdditionalTrainingData();
        env.Service.Configure()
            .DeleteAllCorporaAndFilesAsync(Arg.Any<IEnumerable<ServalCorpusFile>>(), Project01, CancellationToken.None)
            .Returns(Task.CompletedTask);

        // SUT
        ServalAdditionalTrainingData actual = await env.Service.SyncAdditionalTrainingData(
            User01,
            project,
            TranslationEngine01,
            buildConfig,
            additionalTrainingData,
            CancellationToken.None
        );
        Assert.IsNull(actual);
        await env
            .TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteParallelCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), CancellationToken.None);
        await env
            .Service.Received(1)
            .DeleteAllCorporaAndFilesAsync(Arg.Any<IEnumerable<ServalCorpusFile>>(), Project01, CancellationToken.None);
    }

    [Test]
    public async Task SyncAdditionalTrainingData_RemoveAdditionalTrainingDataWithMissingParallelCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        var buildConfig = new BuildConfig();
        var additionalTrainingData = new ServalAdditionalTrainingData { ParallelCorpusId = ParallelCorpus01 };
        env.Service.Configure()
            .DeleteAllCorporaAndFilesAsync(Arg.Any<IEnumerable<ServalCorpusFile>>(), Project01, CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.TranslationEnginesClient.DeleteParallelCorpusAsync(
                TranslationEngine01,
                ParallelCorpus01,
                CancellationToken.None
            )
            .ThrowsAsync(ServalApiExceptions.NotFound);

        // SUT
        ServalAdditionalTrainingData actual = await env.Service.SyncAdditionalTrainingData(
            User01,
            project,
            TranslationEngine01,
            buildConfig,
            additionalTrainingData,
            CancellationToken.None
        );
        Assert.IsNull(actual);
        await env
            .TranslationEnginesClient.Received(1)
            .DeleteParallelCorpusAsync(TranslationEngine01, ParallelCorpus01, CancellationToken.None);
        await env
            .Service.Received(1)
            .DeleteAllCorporaAndFilesAsync(Arg.Any<IEnumerable<ServalCorpusFile>>(), Project01, CancellationToken.None);
        env.MockLogger.AssertHasEvent(logEvent => logEvent.LogLevel == LogLevel.Information);
    }

    [Test]
    public async Task SyncAdditionalTrainingData_RemoveAdditionalTrainingDataWithParallelCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        var buildConfig = new BuildConfig();
        var additionalTrainingData = new ServalAdditionalTrainingData { ParallelCorpusId = ParallelCorpus01 };
        env.Service.Configure()
            .DeleteAllCorporaAndFilesAsync(Arg.Any<IEnumerable<ServalCorpusFile>>(), Project01, CancellationToken.None)
            .Returns(Task.CompletedTask);

        // SUT
        ServalAdditionalTrainingData actual = await env.Service.SyncAdditionalTrainingData(
            User01,
            project,
            TranslationEngine01,
            buildConfig,
            additionalTrainingData,
            CancellationToken.None
        );
        Assert.IsNull(actual);
        await env
            .TranslationEnginesClient.Received(1)
            .DeleteParallelCorpusAsync(TranslationEngine01, ParallelCorpus01, CancellationToken.None);
        await env
            .Service.Received(1)
            .DeleteAllCorporaAndFilesAsync(Arg.Any<IEnumerable<ServalCorpusFile>>(), Project01, CancellationToken.None);
    }

    [Test]
    public async Task SyncAdditionalTrainingData_UploadAdditionalTrainingDataWithExistingParallelCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupTrainingDataAsync(Project01);
        var project = new SFProject { Id = Project01 };
        var buildConfig = new BuildConfig { TrainingDataFiles = [Data01] };
        var additionalTrainingData = new ServalAdditionalTrainingData
        {
            CorpusFiles =
            [
                new ServalCorpusFile
                {
                    CorpusId = Corpus01,
                    FileId = File01,
                    TextId = Data01,
                },
                new ServalCorpusFile
                {
                    CorpusId = Corpus01,
                    FileId = File02,
                    TextId = Data01,
                },
                new ServalCorpusFile
                {
                    CorpusId = Corpus02,
                    FileId = File03,
                    TextId = Data01,
                },
                new ServalCorpusFile
                {
                    CorpusId = Corpus02,
                    FileId = File04,
                    TextId = Data01,
                },
            ],
            ParallelCorpusId = ParallelCorpus01,
            SourceCorpusId = Corpus01,
            TargetCorpusId = Corpus02,
        };
        env.Service.Configure().GetSourceLanguage(project).Returns("en");
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult("de"));
        env.Service.Configure()
            .CreateOrUpdateParallelCorpusAsync(
                TranslationEngine01,
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<IList<string>>(),
                Arg.Any<IList<string>>(),
                CancellationToken.None
            )
            .Returns(ParallelCorpus01);
        env.Service.Configure()
            .UploadAdditionalTrainingDataAsync(
                Project01,
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<List<ServalCorpusFile>>(),
                Arg.Any<List<ISFText>>(),
                CancellationToken.None
            )
            .Returns(args => Task.FromResult(args[1] as string));

        // SUT
        ServalAdditionalTrainingData actual = await env.Service.SyncAdditionalTrainingData(
            User01,
            project,
            TranslationEngine01,
            buildConfig,
            additionalTrainingData,
            CancellationToken.None
        );
        Assert.AreEqual(ParallelCorpus01, actual?.ParallelCorpusId);
        await env.CorporaClient.Received(1).UpdateAsync(Corpus01, Arg.Any<IEnumerable<CorpusFileConfig>>());
        await env.CorporaClient.Received(1).UpdateAsync(Corpus02, Arg.Any<IEnumerable<CorpusFileConfig>>());
        await env
            .TrainingDataService.Received(1)
            .GetTextsAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<IEnumerable<string>>(),
                Arg.Any<IList<ISFText>>(),
                Arg.Any<IList<ISFText>>()
            );
    }

    [Test]
    public async Task SyncAdditionalTrainingData_UploadAdditionalTrainingDataWithoutParallelCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupTrainingDataAsync(Project01);
        const string sourceLanguage = "en";
        var project = new SFProject { Id = Project01 };
        var buildConfig = new BuildConfig { TrainingDataFiles = [Data01] };
        var additionalTrainingData = new ServalAdditionalTrainingData();
        env.Service.Configure().GetSourceLanguage(project).Returns(sourceLanguage);
        env.Service.Configure().GetTargetLanguageAsync(project).Returns(Task.FromResult("de"));
        env.Service.Configure()
            .CreateOrUpdateParallelCorpusAsync(
                TranslationEngine01,
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<IList<string>>(),
                Arg.Any<IList<string>>(),
                CancellationToken.None
            )
            .Returns(ParallelCorpus01);
        env.Service.Configure()
            .UploadAdditionalTrainingDataAsync(
                Project01,
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<List<ServalCorpusFile>>(),
                Arg.Any<List<ISFText>>(),
                CancellationToken.None
            )
            .Returns(args =>
            {
                string corpusId = (string)args[2] == sourceLanguage ? Corpus01 : Corpus02;
                ((List<ServalCorpusFile>)args[3]).Add(
                    new ServalCorpusFile
                    {
                        CorpusId = corpusId,
                        FileId = File01,
                        TextId = Data01,
                    }
                );
                return Task.FromResult(corpusId);
            });

        // SUT
        ServalAdditionalTrainingData actual = await env.Service.SyncAdditionalTrainingData(
            User01,
            project,
            TranslationEngine01,
            buildConfig,
            additionalTrainingData,
            CancellationToken.None
        );
        Assert.AreEqual(ParallelCorpus01, actual?.ParallelCorpusId);
        // UploadAdditionalTrainingDataAsync will perform the initial corpus CreateAsync()
        await env.CorporaClient.Received(1).UpdateAsync(Corpus01, Arg.Any<IEnumerable<CorpusFileConfig>>());
        await env.CorporaClient.Received(1).UpdateAsync(Corpus02, Arg.Any<IEnumerable<CorpusFileConfig>>());
        await env
            .TrainingDataService.Received(1)
            .GetTextsAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<IEnumerable<string>>(),
                Arg.Any<IList<ISFText>>(),
                Arg.Any<IList<ISFText>>()
            );
    }

    [Test]
    public async Task SyncAdditionalTrainingData_NoAdditionalTrainingData()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var project = new SFProject { Id = Project01 };
        var buildConfig = new BuildConfig();

        // SUT
        ServalAdditionalTrainingData actual = await env.Service.SyncAdditionalTrainingData(
            User01,
            project,
            TranslationEngine01,
            buildConfig,
            additionalTrainingData: null,
            CancellationToken.None
        );
        Assert.IsNull(actual);
    }

    [Test]
    [TestCaseSource(nameof(SyncProjectCorporaAsyncOptions))]
    public async Task SyncProjectCorporaAsync_Success(TestEnvironmentOptions options)
    {
        // Set up test environment
        var env = new TestEnvironment(
            options with
            {
                HasTranslationEngineForNmt = options.PreTranslate,
                HasTranslationEngineForSmt = !options.PreTranslate,
            }
        );
        env.Service.Configure()
            .GetCorpusIdFromServalAsync(Corpus01, CancellationToken.None)
            .Returns(Task.FromResult(Corpus01));
        env.Service.Configure()
            .UploadParatextFileAsync(Arg.Any<ServalCorpusFile>(), Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.Service.Configure()
            .DeleteAllCorporaAndFilesAsync(Arg.Any<IEnumerable<ServalCorpusFile>>(), Project02, CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.Service.Configure()
            .CreateOrUpdateParallelCorpusAsync(
                options.PreTranslate ? TranslationEngine01 : TranslationEngine02,
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<IList<string>>(),
                Arg.Any<IList<string>>(),
                CancellationToken.None
            )
            .Returns(ParallelCorpus01);
        env.Service.Configure()
            .SyncAdditionalTrainingData(
                User01,
                Arg.Any<SFProject>(),
                options.PreTranslate ? TranslationEngine01 : TranslationEngine02,
                Arg.Any<BuildConfig>(),
                Arg.Any<ServalAdditionalTrainingData?>(),
                CancellationToken.None
            )
            .Returns(args => args[4] as ServalAdditionalTrainingData);

        // SUT 1
        IList<ServalCorpusSyncInfo> actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: options.PreTranslate,
            CancellationToken.None
        );
        await env.AssertSyncProjectCorporaAsync(options, actual, createsServalCorpora: true);

        // Re-run using existing ServalCorpusFiles
        Assert.IsNotEmpty(env.ProjectSecrets.Get(Project02).ServalData!.CorpusFiles);

        // SUT 2
        actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: options.PreTranslate,
            CancellationToken.None
        );
        await env.AssertSyncProjectCorporaAsync(options, actual, createsServalCorpora: false);

        // Re-run after changing the languages
        await env.Projects.UpdateAsync(
            Project02,
            op =>
            {
                op.Set(p => p.WritingSystem.Tag, "fr");
                op.Set(p => p.TranslateConfig.Source.WritingSystem.Tag, "fr_be");
                if (options.AlternateSource)
                {
                    op.Set(p => p.TranslateConfig.DraftConfig.AlternateSource.WritingSystem.Tag, "fr_ca");
                }

                if (options.AlternateTrainingSource)
                {
                    op.Set(p => p.TranslateConfig.DraftConfig.AlternateTrainingSource.WritingSystem.Tag, "fr_ch");
                }

                if (options.AdditionalTrainingSource)
                {
                    op.Set(p => p.TranslateConfig.DraftConfig.AdditionalTrainingSource.WritingSystem.Tag, "fr_lu");
                }
            }
        );

        // SUT 3
        actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: options.PreTranslate,
            CancellationToken.None
        );
        await env.AssertSyncProjectCorporaAsync(options, actual, createsServalCorpora: true);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_ThrowsExceptionWhenPreTranslationEngineIdMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.UpdateAsync(Project01, op => op.Set(p => p.ServalData, new ServalData()));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.SyncProjectCorporaAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: true,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_ThrowsExceptionWhenProjectMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.DeleteAllAsync(_ => true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.SyncProjectCorporaAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.DeleteAllAsync(_ => true);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.SyncProjectCorporaAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_ThrowsExceptionWhenServalConfigMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.UpdateAsync(Project01, op => op.Unset(p => p.ServalData));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.SyncProjectCorporaAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_ThrowsExceptionWhenSourceMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(Project01, op => op.Unset(p => p.TranslateConfig.Source));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.SyncProjectCorporaAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_ThrowsExceptionWhenTranslationEngineIdMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.ProjectSecrets.UpdateAsync(Project01, op => op.Set(p => p.ServalData, new ServalData()));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.SyncProjectCorporaAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task TranslationEngineExistsAsync_Forbidden_False()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.Forbidden);

        // SUT
        bool actual = await env.Service.TranslationEngineExistsAsync(
            Project01,
            TranslationEngine01,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
    }

    [Test]
    public async Task TranslationEngineExistsAsync_NotFound_False()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // SUT
        bool actual = await env.Service.TranslationEngineExistsAsync(
            Project01,
            TranslationEngine01,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
    }

    [Test]
    public async Task TranslationEngineExistsAsync_NullTranslationId_False()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        bool actual = await env.Service.TranslationEngineExistsAsync(
            Project01,
            translationEngineId: null,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
    }

    [Test]
    public async Task TranslationEngineExistsAsync_WrongProjectId_False()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        Name = Project02,
                        Type = MachineProjectService.SmtTransfer,
                    }
                )
            );

        // SUT
        bool actual = await env.Service.TranslationEngineExistsAsync(
            Project01,
            TranslationEngine01,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
    }

    [Test]
    public async Task TranslationEngineExistsAsync_Type_False()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        Name = Project01,
                        Type = MachineProjectService.Nmt,
                    }
                )
            );

        // SUT
        bool actual = await env.Service.TranslationEngineExistsAsync(
            Project01,
            TranslationEngine01,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
    }

    [Test]
    public async Task TranslationEngineExistsAsync_Type_SupportsKebabCase()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        Name = Project01,
                        Type = "smt-transfer",
                    }
                )
            );

        // SUT
        bool actual = await env.Service.TranslationEngineExistsAsync(
            Project01,
            TranslationEngine01,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
    }

    [Test]
    public async Task TranslationEngineExistsAsync_Type_SupportsPascalCase()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        Name = Project01,
                        Type = "SmtTransfer",
                    }
                )
            );

        // SUT
        bool actual = await env.Service.TranslationEngineExistsAsync(
            Project01,
            TranslationEngine01,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
    }

    [Test]
    public async Task TranslationEngineExistsAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        Name = Project01,
                        Type = MachineProjectService.SmtTransfer,
                    }
                )
            );

        // SUT
        bool actual = await env.Service.TranslationEngineExistsAsync(
            Project01,
            TranslationEngine01,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
    }

    [Test]
    public void TranslationEngineExistsAsync_ThrowsOtherErrors()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Throws(ServalApiExceptions.InternalServerError);

        // SUT
        Assert.ThrowsAsync<ServalApiException>(
            () =>
                env.Service.TranslationEngineExistsAsync(
                    Project01,
                    TranslationEngine01,
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task UpdateTranslationSourcesAsync_DoesNotUpdateIfNoAlternateSources()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.UpdateTranslationSourcesAsync(User01, Project01);
        env.ParatextService.DidNotReceiveWithAnyArgs().GetParatextSettings(Arg.Any<UserSecret>(), Paratext01);
    }

    [Test]
    public void UpdateTranslationSourcesAsync_ThrowsMissingProjectException()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.UpdateTranslationSourcesAsync(User01, "invalid_project_id")
        );
    }

    [Test]
    public void UpdateTranslationSourcesAsync_ThrowsMissingUserSecretException()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.UpdateTranslationSourcesAsync("invalid_user_id", Project01)
        );
    }

    [Test]
    public async Task UpdateTranslationSourcesAsync_UpdatesAlternateSource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(
            p => p.Id == Project01,
            u =>
                u.Set(
                    s => s.TranslateConfig.DraftConfig,
                    new DraftConfig
                    {
                        AlternateSourceEnabled = true,
                        AlternateSource = new TranslateSource { ParatextId = Paratext01 },
                    }
                )
        );

        // SUT
        await env.Service.UpdateTranslationSourcesAsync(User01, Project01);
        env.ParatextService.Received(1).GetParatextSettings(Arg.Any<UserSecret>(), Paratext01);
        Assert.IsTrue(env.Projects.Get(Project01).TranslateConfig.DraftConfig.AlternateSource?.IsRightToLeft);
        Assert.AreEqual(
            LanguageTag,
            env.Projects.Get(Project01).TranslateConfig.DraftConfig.AlternateSource?.WritingSystem.Tag
        );
    }

    [Test]
    public async Task UpdateTranslationSourcesAsync_UpdatesAlternateTrainingSource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(
            p => p.Id == Project01,
            u =>
                u.Set(
                    s => s.TranslateConfig.DraftConfig,
                    new DraftConfig
                    {
                        AlternateTrainingSourceEnabled = true,
                        AlternateTrainingSource = new TranslateSource { ParatextId = Paratext01 },
                    }
                )
        );

        // SUT
        await env.Service.UpdateTranslationSourcesAsync(User01, Project01);
        env.ParatextService.Received(1).GetParatextSettings(Arg.Any<UserSecret>(), Paratext01);
        Assert.IsTrue(env.Projects.Get(Project01).TranslateConfig.DraftConfig.AlternateTrainingSource?.IsRightToLeft);
        Assert.AreEqual(
            LanguageTag,
            env.Projects.Get(Project01).TranslateConfig.DraftConfig.AlternateTrainingSource?.WritingSystem.Tag
        );
    }

    [Test]
    public async Task UpdateTranslationSourcesAsync_UpdatesAdditionalTrainingSource()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(
            p => p.Id == Project01,
            u =>
                u.Set(
                    s => s.TranslateConfig.DraftConfig,
                    new DraftConfig
                    {
                        AdditionalTrainingSourceEnabled = true,
                        AdditionalTrainingSource = new TranslateSource { ParatextId = Paratext01 },
                    }
                )
        );

        // SUT
        await env.Service.UpdateTranslationSourcesAsync(User01, Project01);
        env.ParatextService.Received(1).GetParatextSettings(Arg.Any<UserSecret>(), Paratext01);
        Assert.IsTrue(env.Projects.Get(Project01).TranslateConfig.DraftConfig.AdditionalTrainingSource!.IsRightToLeft);
        Assert.AreEqual(
            LanguageTag,
            env.Projects.Get(Project01).TranslateConfig.DraftConfig.AdditionalTrainingSource!.WritingSystem.Tag
        );
    }

    [Test]
    public async Task UploadAdditionalTrainingDataAsync_CreatesTheCorpusIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Set up the test data
        const string languageCode = "en";
        List<ServalCorpusFile> servalCorpusFiles = [];
        ISFText text = TestEnvironment.GetMockTrainingData();
        List<ISFText> texts = [text];

        // Set up other API calls
        env.CorporaClient.CreateAsync(Arg.Any<CorpusConfig>()).Returns(Task.FromResult(new Corpus { Id = Corpus01 }));
        env.Service.Configure()
            .UploadTextFileAsync(Arg.Any<ServalCorpusFile>(), text, CancellationToken.None)
            .Returns(Task.FromResult(true));

        string actual = await env.Service.UploadAdditionalTrainingDataAsync(
            Project01,
            null,
            languageCode,
            servalCorpusFiles,
            texts,
            CancellationToken.None
        );
        Assert.AreEqual(Corpus01, actual);
        Assert.AreEqual(Corpus01, servalCorpusFiles.First().CorpusId);
        Assert.AreEqual(Project01, servalCorpusFiles.First().ProjectId);
        Assert.AreEqual(languageCode, servalCorpusFiles.First().LanguageCode);
        await env.CorporaClient.DidNotReceiveWithAnyArgs().DeleteAsync(Corpus01);
        await env.CorporaClient.Received(1).CreateAsync(Arg.Any<CorpusConfig>());
    }

    [Test]
    public async Task UploadAdditionalTrainingDataAsync_OnlyReturnsUploadedServalCorpusFiles()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Set up the test data
        const string languageCode = "en";
        var servalCorpusFile = new ServalCorpusFile
        {
            CorpusId = Corpus01,
            LanguageCode = languageCode,
            TextId = Data01,
        };
        List<ServalCorpusFile> servalCorpusFiles = [servalCorpusFile];
        ISFText text = TestEnvironment.GetMockTrainingData();
        List<ISFText> texts = [text];

        // Set up other API calls
        env.Service.Configure()
            .UploadTextFileAsync(servalCorpusFile, text, CancellationToken.None)
            .Returns(Task.FromResult(false));
        env.Service.Configure()
            .GetCorpusIdFromServalAsync(Corpus01, CancellationToken.None)
            .Returns(Task.FromResult(Corpus01));

        string actual = await env.Service.UploadAdditionalTrainingDataAsync(
            Project01,
            Corpus01,
            languageCode,
            servalCorpusFiles,
            texts,
            CancellationToken.None
        );
        Assert.AreEqual(Corpus01, actual);
        Assert.IsEmpty(servalCorpusFiles);
        await env.CorporaClient.DidNotReceiveWithAnyArgs().DeleteAsync(Corpus01);
        await env.CorporaClient.DidNotReceiveWithAnyArgs().CreateAsync(Arg.Any<CorpusConfig>());
    }

    [Test]
    public async Task UploadAdditionalTrainingDataAsync_RecreatesCorpusIfLanguageChanges()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Set up the test data
        const string oldLanguageCode = "en";
        const string newLanguageCode = "de";
        var servalCorpusFile = new ServalCorpusFile
        {
            CorpusId = Corpus01,
            LanguageCode = oldLanguageCode,
            TextId = Data01,
        };
        List<ServalCorpusFile> servalCorpusFiles = [servalCorpusFile];
        ISFText text = TestEnvironment.GetMockTrainingData();
        List<ISFText> texts = [text];

        // Set up other API calls
        env.CorporaClient.CreateAsync(Arg.Any<CorpusConfig>()).Returns(Task.FromResult(new Corpus { Id = Corpus02 }));
        env.Service.Configure()
            .UploadTextFileAsync(servalCorpusFile, text, CancellationToken.None)
            .Returns(Task.FromResult(true));

        string actual = await env.Service.UploadAdditionalTrainingDataAsync(
            Project01,
            Corpus01,
            newLanguageCode,
            servalCorpusFiles,
            texts,
            CancellationToken.None
        );
        Assert.AreEqual(Corpus02, actual);
        Assert.AreEqual(Corpus02, servalCorpusFiles.First().CorpusId);
        Assert.AreEqual(Project01, servalCorpusFiles.First().ProjectId);
        Assert.AreEqual(newLanguageCode, servalCorpusFiles.First().LanguageCode);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus01);
        await env.CorporaClient.Received(1).CreateAsync(Arg.Any<CorpusConfig>());
    }

    [Test]
    public async Task UploadAdditionalTrainingDataAsync_RecreatesCorpusIfLanguageChangesAndCorpusIsMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Set up the test data
        const string oldLanguageCode = "en";
        const string newLanguageCode = "de";
        var servalCorpusFile = new ServalCorpusFile
        {
            CorpusId = Corpus01,
            LanguageCode = oldLanguageCode,
            TextId = Data01,
        };
        List<ServalCorpusFile> servalCorpusFiles = [servalCorpusFile];
        ISFText text = TestEnvironment.GetMockTrainingData();
        List<ISFText> texts = [text];

        // Set up other API calls
        env.CorporaClient.CreateAsync(Arg.Any<CorpusConfig>()).Returns(Task.FromResult(new Corpus { Id = Corpus02 }));
        env.CorporaClient.DeleteAsync(Corpus01).ThrowsAsync(ServalApiExceptions.NotFound);
        env.Service.Configure()
            .UploadTextFileAsync(servalCorpusFile, text, CancellationToken.None)
            .Returns(Task.FromResult(true));

        string actual = await env.Service.UploadAdditionalTrainingDataAsync(
            Project01,
            Corpus01,
            newLanguageCode,
            servalCorpusFiles,
            texts,
            CancellationToken.None
        );
        Assert.AreEqual(Corpus02, actual);
        Assert.AreEqual(Corpus02, servalCorpusFiles.First().CorpusId);
        Assert.AreEqual(Project01, servalCorpusFiles.First().ProjectId);
        Assert.AreEqual(newLanguageCode, servalCorpusFiles.First().LanguageCode);
        await env.CorporaClient.Received(1).DeleteAsync(Corpus01);
        await env.CorporaClient.Received(1).CreateAsync(Arg.Any<CorpusConfig>());
    }

    [Test]
    public async Task UploadAdditionalTrainingDataAsync_UpdatesTheCorpus()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Set up the test data
        const string languageCode = "en";
        var servalCorpusFile = new ServalCorpusFile
        {
            CorpusId = Corpus01,
            LanguageCode = languageCode,
            TextId = Data01,
        };
        List<ServalCorpusFile> servalCorpusFiles = [servalCorpusFile];
        ISFText text = TestEnvironment.GetMockTrainingData();
        List<ISFText> texts = [text];

        // Set up other API calls
        env.Service.Configure()
            .UploadTextFileAsync(Arg.Any<ServalCorpusFile>(), text, CancellationToken.None)
            .Returns(Task.FromResult(true));
        env.Service.Configure()
            .GetCorpusIdFromServalAsync(Corpus01, CancellationToken.None)
            .Returns(Task.FromResult(Corpus01));

        string actual = await env.Service.UploadAdditionalTrainingDataAsync(
            Project01,
            Corpus01,
            languageCode,
            servalCorpusFiles,
            texts,
            CancellationToken.None
        );
        Assert.AreEqual(Corpus01, actual);
        Assert.AreEqual(servalCorpusFile, servalCorpusFiles.First());
        await env.CorporaClient.DidNotReceiveWithAnyArgs().DeleteAsync(Corpus01);
        await env.CorporaClient.DidNotReceiveWithAnyArgs().CreateAsync(Arg.Any<CorpusConfig>());
    }

    [Test]
    public async Task UploadFileAsync_ChecksumMatches()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Set up the text file
        const string textFileData = "My text file data";
        var servalCorpusFile = new ServalCorpusFile { FileChecksum = StringUtils.ComputeMd5Hash(textFileData) };
        byte[] buffer = Encoding.UTF8.GetBytes(textFileData);
        await using Stream stream = new MemoryStream(buffer, false);

        // SUT
        await env.Service.UploadFileAsync(servalCorpusFile, stream, FileFormat.Text, CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text);
    }

    [Test]
    public async Task UploadFileAsync_CreatesIfFileFormatChanges()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.DataFilesClient.GetAsync(File01).Returns(new DataFile { Id = File01, Format = FileFormat.Paratext });
        env.DataFilesClient.CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Project01)
            .Returns(new DataFile { Id = File02 });

        // Set up the text file
        const string textFileData = "My text file data";
        string checksum = StringUtils.ComputeMd5Hash(textFileData);
        var servalCorpusFile = new ServalCorpusFile { TextId = Project01, FileId = File01 };
        byte[] buffer = Encoding.UTF8.GetBytes(textFileData);
        await using Stream stream = new MemoryStream(buffer, false);

        // SUT
        await env.Service.UploadFileAsync(servalCorpusFile, stream, FileFormat.Text, CancellationToken.None);
        Assert.AreEqual(checksum, servalCorpusFile.FileChecksum);
        Assert.AreEqual(File02, servalCorpusFile.FileId);
        await env.DataFilesClient.Received(1).DeleteAsync(File01);
        env.MockLogger.AssertHasEvent(logEvent => logEvent.LogLevel == LogLevel.Information);
    }

    [Test]
    public async Task UploadFileAsync_CreatesIfFileNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        ServalApiException ex = ServalApiExceptions.NotFound;
        env.DataFilesClient.GetAsync(File01).ThrowsAsync(ex);
        env.DataFilesClient.CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Project01)
            .Returns(new DataFile { Id = File02 });

        // Set up the text file
        const string textFileData = "My text file data";
        string checksum = StringUtils.ComputeMd5Hash(textFileData);
        var servalCorpusFile = new ServalCorpusFile { TextId = Project01, FileId = File01 };
        byte[] buffer = Encoding.UTF8.GetBytes(textFileData);
        await using Stream stream = new MemoryStream(buffer, false);

        // SUT
        await env.Service.UploadFileAsync(servalCorpusFile, stream, FileFormat.Text, CancellationToken.None);
        Assert.AreEqual(checksum, servalCorpusFile.FileChecksum);
        Assert.AreEqual(File02, servalCorpusFile.FileId);
        await env.DataFilesClient.DidNotReceive().DeleteAsync(File01);
        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Information
        );
    }

    [Test]
    public async Task UploadFileAsync_CreatesIfNoExistingFile()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.DataFilesClient.CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Project01)
            .Returns(new DataFile { Id = File01 });

        // Set up the text file
        const string textFileData = "My text file data";
        string checksum = StringUtils.ComputeMd5Hash(textFileData);
        var servalCorpusFile = new ServalCorpusFile { TextId = Project01 };
        byte[] buffer = Encoding.UTF8.GetBytes(textFileData);
        await using Stream stream = new MemoryStream(buffer, false);

        // SUT
        await env.Service.UploadFileAsync(servalCorpusFile, stream, FileFormat.Text, CancellationToken.None);
        Assert.AreEqual(checksum, servalCorpusFile.FileChecksum);
        Assert.AreEqual(File01, servalCorpusFile.FileId);
    }

    [Test]
    public async Task UploadFileAsync_UpdatesIfFileExists()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.DataFilesClient.GetAsync(File01).Returns(new DataFile { Id = File01, Format = FileFormat.Text });
        env.DataFilesClient.UpdateAsync(File01, Arg.Any<FileParameter>()).Returns(new DataFile { Id = File01 });

        // Set up the text file
        const string textFileData = "My text file data";
        string checksum = StringUtils.ComputeMd5Hash(textFileData);
        var servalCorpusFile = new ServalCorpusFile { TextId = Project01, FileId = File01 };
        byte[] buffer = Encoding.UTF8.GetBytes(textFileData);
        await using Stream stream = new MemoryStream(buffer, false);

        // SUT
        await env.Service.UploadFileAsync(servalCorpusFile, stream, FileFormat.Text, CancellationToken.None);
        Assert.AreEqual(checksum, servalCorpusFile.FileChecksum);
        Assert.AreEqual(File01, servalCorpusFile.FileId);
        await env
            .DataFilesClient.DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Project01);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(File01);
    }

    [Test]
    public async Task UploadParatextFileAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalCorpusFile = new ServalCorpusFile();
        env.Service.CreateZipFileFromParatextDirectoryAsync(Paratext01, Arg.Any<MemoryStream>(), CancellationToken.None)
            .Returns(Task.CompletedTask);
        env.Service.UploadFileAsync(
                servalCorpusFile,
                Arg.Any<MemoryStream>(),
                FileFormat.Paratext,
                CancellationToken.None
            )
            .Returns(Task.FromResult(true));

        // SUT
        await env.Service.UploadParatextFileAsync(servalCorpusFile, Paratext01, CancellationToken.None);
        await env
            .Service.Received(1)
            .UploadFileAsync(servalCorpusFile, Arg.Any<MemoryStream>(), FileFormat.Paratext, CancellationToken.None);
    }

    [Test]
    public async Task UploadTextFileAsync_EmptyTextFile()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalCorpusFile = new ServalCorpusFile();
        var text = TestEnvironment.GetMockTrainingData();
        env.Service.GetTextFileData(text).Returns(string.Empty);

        // SUT
        bool actual = await env.Service.UploadTextFileAsync(servalCorpusFile, text, CancellationToken.None);
        Assert.IsFalse(actual);
    }

    [Test]
    public async Task UploadTextFileAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();
        var servalCorpusFile = new ServalCorpusFile();
        var text = TestEnvironment.GetMockTrainingData();
        env.Service.GetTextFileData(text).Returns("File Data");
        env.Service.UploadFileAsync(servalCorpusFile, Arg.Any<MemoryStream>(), FileFormat.Text, CancellationToken.None)
            .Returns(Task.FromResult(true));

        // SUT
        bool actual = await env.Service.UploadTextFileAsync(servalCorpusFile, text, CancellationToken.None);
        Assert.IsTrue(actual);
    }

    /// <summary>
    /// Gets the test environment options for SyncProjectCorporaAsync
    /// to ensure an adequate feature test coverage matrix.
    /// </summary>
    public static IEnumerable<TestEnvironmentOptions> SyncProjectCorporaAsyncOptions
    {
        get
        {
            bool[] boolValues = [false, true];
            foreach (bool preTranslate in boolValues)
            {
                foreach (bool alternateSource in boolValues)
                {
                    foreach (bool alternateTrainingSource in boolValues)
                    {
                        foreach (bool additionalTrainingSource in boolValues)
                        {
                            yield return new TestEnvironmentOptions
                            {
                                AlternateSource = alternateSource,
                                AlternateTrainingSource = alternateTrainingSource,
                                AdditionalTrainingSource = additionalTrainingSource,
                                PreTranslate = preTranslate,
                            };
                        }
                    }
                }

                // Emit special test cases with pre-translate enabled or disabled
                yield return new TestEnvironmentOptions
                {
                    AlternateTrainingSource = true,
                    AlternateTrainingSourceAndSourceAreTheSame = true,
                    PreTranslate = preTranslate,
                };
            }
        }
    }

    public record TestEnvironmentOptions
    {
        public bool AdditionalTrainingSource { get; init; }
        public bool AlternateSource { get; init; }
        public bool AlternateTrainingSource { get; init; }
        public bool AlternateTrainingSourceAndSourceAreTheSame { get; init; }
        public bool HasTranslationEngineForNmt { get; init; }
        public bool HasTranslationEngineForSmt { get; init; }
        public bool LegacyCorpora { get; init; }
        public bool PreTranslate { get; init; }
        public bool UseEchoForPreTranslation { get; init; }
    }

    private class TestEnvironment
    {
        public TestEnvironment(TestEnvironmentOptions? options = null)
        {
            options ??= new TestEnvironmentOptions();
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            MockLogger = new MockLogger<MachineProjectService>();
            CorporaClient = Substitute.For<ICorporaClient>();
            DataFilesClient = Substitute.For<IDataFilesClient>();
            DataFilesClient
                .CreateAsync(Arg.Any<FileParameter>(), Arg.Any<FileFormat>(), Arg.Any<string>(), CancellationToken.None)
                .Returns(Task.FromResult(new DataFile { Id = File01 }));
            DataFilesClient
                .UpdateAsync(Arg.Any<string>(), Arg.Any<FileParameter>())
                .Returns(args => Task.FromResult(new DataFile { Id = args.ArgAt<string>(0) }));
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            TranslationEnginesClient
                .AddParallelCorpusAsync(
                    Arg.Any<string>(),
                    Arg.Any<TranslationParallelCorpusConfig>(),
                    CancellationToken.None
                )
                .Returns(Task.FromResult(new TranslationParallelCorpus { Id = ParallelCorpus01 }));
            TranslationEnginesClient
                .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None)
                .Returns(Task.FromResult(new TranslationEngine { Id = TranslationEngine01 }));
            TranslationEnginesClient
                .GetAsync(TranslationEngine01, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new TranslationEngine
                        {
                            Id = TranslationEngine01,
                            Name = Project01,
                            SourceLanguage = "en_US",
                            TargetLanguage = "en_GB",
                            Type = MachineProjectService.SmtTransfer,
                        }
                    )
                );
            TranslationEnginesClient
                .GetAsync(TranslationEngine02, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new TranslationEngine
                        {
                            Id = TranslationEngine02,
                            Name = Project02,
                            SourceLanguage = "en",
                            TargetLanguage = "en_US",
                            Type = MachineProjectService.SmtTransfer,
                        }
                    )
                );
            CorporaClient
                .CreateAsync(Arg.Any<CorpusConfig>(), CancellationToken.None)
                .Returns(Task.FromResult(new Corpus { Id = Corpus01 }));

            ParatextService = Substitute.For<IParatextService>();
            ParatextService
                .GetWritingSystem(Arg.Any<UserSecret>(), Arg.Any<string>())
                .Returns(new WritingSystem { Tag = "en" });
            ParatextService
                .GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
                .Returns(new ParatextSettings { IsRightToLeft = true, LanguageTag = LanguageTag });

            FeatureManager = Substitute.For<IFeatureManager>();
            FeatureManager
                .IsEnabledAsync(FeatureFlags.UseEchoForPreTranslation)
                .Returns(Task.FromResult(options.UseEchoForPreTranslation));

            FileSystemService = Substitute.For<IFileSystemService>();
            FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(true);
            FileSystemService
                .EnumerateFiles(Arg.Any<string>())
                .Returns(callInfo => [Path.Combine(callInfo.ArgAt<string>(0), "file")]);
            FileSystemService
                .OpenFile(Arg.Any<string>(), FileMode.Open)
                .Returns(callInfo => new MemoryStream(
                    Encoding.UTF8.GetBytes(Path.Combine(callInfo.ArgAt<string>(0) + "_file_contents"))
                ));

            ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                [
                    new SFProjectSecret { Id = Project01 },
                    new SFProjectSecret
                    {
                        Id = Project02,
                        ServalData = new ServalData
                        {
                            PreTranslationEngineId = options.HasTranslationEngineForNmt ? TranslationEngine01 : null,
                            TranslationEngineId = options.HasTranslationEngineForSmt ? TranslationEngine02 : null,
                            Corpora = options.LegacyCorpora
                                ? new Dictionary<string, ServalCorpus>
                                {
                                    {
                                        Corpus01,
                                        new ServalCorpus
                                        {
                                            PreTranslate = false,
                                            AlternateTrainingSource = false,
                                            SourceFiles =
                                            [
                                                new ServalCorpusFile { FileId = File01, ProjectId = Project03 },
                                            ],
                                            TargetFiles =
                                            [
                                                new ServalCorpusFile { FileId = File02, ProjectId = Project01 },
                                            ],
                                        }
                                    },
                                    {
                                        Corpus02,
                                        new ServalCorpus
                                        {
                                            PreTranslate = true,
                                            AlternateTrainingSource = false,
                                            SourceFiles =
                                            [
                                                new ServalCorpusFile { FileId = File01, ProjectId = Project03 },
                                            ],
                                            TargetFiles =
                                            [
                                                new ServalCorpusFile { FileId = File02, ProjectId = Project01 },
                                            ],
                                        }
                                    },
                                }
                                : null,
                        },
                    },
                    new SFProjectSecret { Id = Project03 },
                    new SFProjectSecret { Id = Project04 },
                ]
            );

            var siteOptions = Substitute.For<IOptions<SiteOptions>>();
            siteOptions.Value.Returns(new SiteOptions { SiteDir = "xForge" });
            var userSecrets = new MemoryRepository<UserSecret>([new UserSecret { Id = User01 }]);

            Projects = new MemoryRepository<SFProject>(
                [
                    new SFProject
                    {
                        Id = Project01,
                        Name = "project01",
                        ShortName = "P01",
                        ParatextId = Paratext01,
                        CheckingConfig = new CheckingConfig(),
                        UserRoles = [],
                        TranslateConfig = new TranslateConfig
                        {
                            TranslationSuggestionsEnabled = true,
                            Source = new TranslateSource
                            {
                                ProjectRef = Project02,
                                ParatextId = Paratext02,
                                WritingSystem = new WritingSystem { Tag = "en_US" },
                            },
                            DraftConfig = new DraftConfig(),
                        },
                        WritingSystem = new WritingSystem { Tag = "en_GB" },
                    },
                    new SFProject
                    {
                        Id = Project02,
                        Name = "project02",
                        ShortName = "P02",
                        ParatextId = Paratext02,
                        CheckingConfig = new CheckingConfig(),
                        UserRoles = [],
                        TranslateConfig = new TranslateConfig
                        {
                            TranslationSuggestionsEnabled = true,
                            Source = new TranslateSource
                            {
                                ProjectRef = Project01,
                                ParatextId = Paratext01,
                                WritingSystem = new WritingSystem { Tag = "en" },
                            },
                            DraftConfig = new DraftConfig
                            {
                                AlternateSourceEnabled = options.AlternateSource,
                                AlternateSource = options.AlternateSource
                                    ? new TranslateSource
                                    {
                                        ProjectRef = Project03,
                                        ParatextId = Paratext03,
                                        WritingSystem = new WritingSystem { Tag = "en_GB" },
                                    }
                                    : null,
                                AlternateTrainingSourceEnabled = options.AlternateTrainingSource,
                                AlternateTrainingSource = options.AlternateTrainingSource
                                    ? new TranslateSource
                                    {
                                        ProjectRef = options.AlternateTrainingSourceAndSourceAreTheSame
                                            ? Project01
                                            : Project04,
                                        ParatextId = options.AlternateTrainingSourceAndSourceAreTheSame
                                            ? Paratext01
                                            : Paratext04,
                                        WritingSystem = new WritingSystem { Tag = "en_GB" },
                                    }
                                    : null,
                                AdditionalTrainingSourceEnabled = options.AdditionalTrainingSource,
                                AdditionalTrainingSource = options.AdditionalTrainingSource
                                    ? new TranslateSource
                                    {
                                        ProjectRef = Project05,
                                        ParatextId = Paratext05,
                                        WritingSystem = new WritingSystem { Tag = "en_GB" },
                                    }
                                    : null,
                            },
                            PreTranslate =
                                options.AlternateSource
                                || options.AlternateTrainingSource
                                || options.AdditionalTrainingSource,
                        },
                        WritingSystem = new WritingSystem { Tag = "en_US" },
                    },
                    new SFProject
                    {
                        Id = Project03,
                        Name = "project03",
                        ShortName = "P03",
                        ParatextId = Paratext03,
                        CheckingConfig = new CheckingConfig(),
                        UserRoles = [],
                        TranslateConfig = new TranslateConfig
                        {
                            TranslationSuggestionsEnabled = true,
                            Source = new TranslateSource { ProjectRef = Project01, ParatextId = Paratext01 },
                        },
                    },
                    new SFProject
                    {
                        Id = Project04,
                        Name = "project04",
                        ShortName = "P04",
                        ParatextId = Paratext04,
                        CheckingConfig = new CheckingConfig(),
                        UserRoles = [],
                        TranslateConfig = new TranslateConfig { PreTranslate = true, DraftConfig = { } },
                    },
                ]
            );

            TrainingDataService = Substitute.For<ITrainingDataService>();
            TrainingData = new MemoryRepository<TrainingData>();

            RealtimeService = new SFMemoryRealtimeService();
            RealtimeService.AddRepository("sf_projects", OTType.Json0, Projects);
            RealtimeService.AddRepository("training_data", OTType.Json0, TrainingData);

            // We use this so we can mock any virtual methods in the class
            Service = Substitute.ForPartsOf<MachineProjectService>(
                CorporaClient,
                DataFilesClient,
                ExceptionHandler,
                FeatureManager,
                FileSystemService,
                MockLogger,
                ParatextService,
                ProjectSecrets,
                RealtimeService,
                siteOptions,
                TrainingDataService,
                TranslationEnginesClient,
                userSecrets
            );
        }

        public MachineProjectService Service { get; }
        public ICorporaClient CorporaClient { get; }
        public IDataFilesClient DataFilesClient { get; }
        public IFeatureManager FeatureManager { get; }
        public IFileSystemService FileSystemService { get; }
        public IParatextService ParatextService { get; }
        public SFMemoryRealtimeService RealtimeService { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
        private MemoryRepository<TrainingData> TrainingData { get; }
        public ITrainingDataService TrainingDataService { get; }
        public MemoryRepository<SFProject> Projects { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public MockLogger<MachineProjectService> MockLogger { get; }
        public IExceptionHandler ExceptionHandler { get; }

        /// <summary>
        /// Asserts whether the correct API calls have bene made for SyncProjectCorporaAsync.
        /// </summary>
        /// <param name="options">The test environment.</param>
        /// <param name="actual">The actual results from the synchronization.</param>
        /// <param name="createsServalCorpora">If <c>true</c>, expect corpora to be created on Serval.</param>
        /// <returns>An asynchronous task.</returns>
        public async Task AssertSyncProjectCorporaAsync(
            TestEnvironmentOptions options,
            IList<ServalCorpusSyncInfo> actual,
            bool createsServalCorpora
        )
        {
            int numberOfServalCorpusFiles = 2;

            // Target
            await CorporaClient
                .Received(createsServalCorpora ? 1 : 0)
                .CreateAsync(Arg.Is<CorpusConfig>(c => c.Name == $"{Project02}_{Project02}"));
            Assert.AreEqual(options.PreTranslate ? 2 : 1, actual.Count(s => s.ProjectId == Project02));

            // Source
            await CorporaClient
                .Received(createsServalCorpora ? 1 : 0)
                .CreateAsync(Arg.Is<CorpusConfig>(c => c.Name == $"{Project02}_{Project01}"));

            // See how many times the source corpus was used in the parallel corpora
            int expected = options switch
            {
                { PreTranslate: false } => 1,
                {
                    PreTranslate: true,
                    AlternateTrainingSource: true,
                    AlternateTrainingSourceAndSourceAreTheSame: true
                } => 2,
                { PreTranslate: true, AlternateTrainingSource: true, AlternateSource: true } => 0,
                { PreTranslate: true, AlternateTrainingSource: true } => 1,
                { PreTranslate: true, AlternateSource: true } => 1,
                { PreTranslate: true } => 2,
            };
            Assert.AreEqual(expected, actual.Count(s => s.ProjectId == Project01));

            // Alternate Source
            if (options.AlternateSource)
            {
                await CorporaClient
                    .Received(createsServalCorpora ? 1 : 0)
                    .CreateAsync(Arg.Is<CorpusConfig>(c => c.Name == $"{Project02}_{Project03}"));
                Assert.AreEqual(options.PreTranslate ? 1 : 0, actual.Count(s => s.ProjectId == Project03));
                numberOfServalCorpusFiles++;
            }

            // Alternate Training Source
            // This can be used to test that a duplicate corpus and file were not uploaded
            if (options.AlternateTrainingSource && !options.AlternateTrainingSourceAndSourceAreTheSame)
            {
                await CorporaClient
                    .Received(createsServalCorpora ? 1 : 0)
                    .CreateAsync(Arg.Is<CorpusConfig>(c => c.Name == $"{Project02}_{Project04}"));
                Assert.AreEqual(options.PreTranslate ? 1 : 0, actual.Count(s => s.ProjectId == Project04));
                numberOfServalCorpusFiles++;
            }

            // Additional Training Source
            if (options.AdditionalTrainingSource)
            {
                await CorporaClient
                    .Received(createsServalCorpora ? 1 : 0)
                    .CreateAsync(Arg.Is<CorpusConfig>(c => c.Name == $"{Project02}_{Project05}"));
                Assert.AreEqual(options.PreTranslate ? 1 : 0, actual.Count(s => s.ProjectId == Project05));
                numberOfServalCorpusFiles++;
            }

            // Each corpus will be updated, even after creation
            await CorporaClient
                .Received(numberOfServalCorpusFiles)
                .UpdateAsync(Arg.Any<string>(), Arg.Any<IEnumerable<CorpusFileConfig>>());

            // A file will be uploaded for each corpus
            await Service
                .Received(numberOfServalCorpusFiles)
                .UploadParatextFileAsync(Arg.Any<ServalCorpusFile>(), Arg.Any<string>(), CancellationToken.None);

            // The parallel corpora will be created or updated
            await Service
                .Received(options.PreTranslate ? 2 : 1)
                .CreateOrUpdateParallelCorpusAsync(
                    options.PreTranslate ? TranslationEngine01 : TranslationEngine02,
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<IList<string>>(),
                    Arg.Any<IList<string>>(),
                    CancellationToken.None
                );

            // Unused corpora will be removed
            await Service
                .Received(1)
                .DeleteAllCorporaAndFilesAsync(
                    Arg.Any<IEnumerable<ServalCorpusFile>>(),
                    Project02,
                    CancellationToken.None
                );

            // The training data will be synced for pre-translation builds only
            await Service
                .Received(options.PreTranslate ? 1 : 0)
                .SyncAdditionalTrainingData(
                    User01,
                    Arg.Any<SFProject>(),
                    TranslationEngine01,
                    Arg.Any<BuildConfig>(),
                    Arg.Any<ServalAdditionalTrainingData?>(),
                    CancellationToken.None
                );

            // Reset the received calls so we can call SyncProjectCorporaAsync again
            CorporaClient.ClearReceivedCalls();
            Service.ClearReceivedCalls();
        }

        public async Task SetDataInSync(
            string projectId,
            bool preTranslate = false,
            bool uploadParatextZipFile = false,
            bool alternateTrainingSource = false
        ) =>
            await ProjectSecrets.UpdateAsync(
                projectId,
                u =>
                {
                    u.Set(
                        p => p.ServalData.Corpora[Corpus01],
                        new ServalCorpus
                        {
                            SourceFiles =
                            [
                                new ServalCorpusFile
                                {
                                    FileChecksum = "old_checksum",
                                    FileId = File01,
                                    ProjectId = Project03,
                                    TextId = "textId",
                                },
                            ],
                            TargetFiles =
                            [
                                new ServalCorpusFile
                                {
                                    FileChecksum = "old_checksum",
                                    FileId = File02,
                                    ProjectId = projectId,
                                    TextId = "textId",
                                },
                            ],
                            AlternateTrainingSource = false,
                            PreTranslate = preTranslate,
                            UploadParatextZipFile = uploadParatextZipFile,
                        }
                    );
                    if (alternateTrainingSource)
                    {
                        u.Set(
                            p => p.ServalData.Corpora[Corpus02],
                            new ServalCorpus
                            {
                                SourceFiles =
                                [
                                    new ServalCorpusFile
                                    {
                                        FileChecksum = "old_checksum",
                                        FileId = File01,
                                        ProjectId = Project01,
                                        TextId = "textId",
                                    },
                                ],
                                TargetFiles =
                                [
                                    new ServalCorpusFile
                                    {
                                        FileChecksum = "old_checksum",
                                        FileId = File02,
                                        ProjectId = projectId,
                                        TextId = "textId",
                                    },
                                ],
                                AlternateTrainingSource = true,
                                PreTranslate = preTranslate,
                                UploadParatextZipFile = uploadParatextZipFile,
                            }
                        );
                    }
                    if (preTranslate)
                    {
                        u.Set(p => p.ServalData.PreTranslationEngineId, TranslationEngine02);
                        TranslationEnginesClient
                            .GetAsync(TranslationEngine02, CancellationToken.None)
                            .Returns(
                                Task.FromResult(
                                    new TranslationEngine
                                    {
                                        Id = TranslationEngine02,
                                        Name = Project02,
                                        SourceLanguage = "en",
                                        TargetLanguage = "en_US",
                                        Type = MachineProjectService.Nmt,
                                    }
                                )
                            );
                    }
                }
            );

        /// <summary>
        /// Sets up the Project Secret.
        /// </summary>
        /// <param name="projectId">The project identifier.</param>
        /// <param name="servalData">The Serval configuration data.</param>
        /// <returns>The asynchronous task.</returns>
        public async Task SetupProjectSecretAsync(string projectId, ServalData? servalData) =>
            await ProjectSecrets.UpdateAsync(projectId, u => u.Set(p => p.ServalData, servalData));

        /// <summary>
        /// Sets up the additional training data
        /// </summary>
        /// <param name="projectId">The project identifier.</param>
        /// <param name="existingData">
        /// If the project is to have existing data, <c>true</c>. Default: <c>false</c>.
        /// </param>
        public async Task SetupTrainingDataAsync(string projectId, bool existingData = false)
        {
            TrainingData.Add(
                new TrainingData
                {
                    Id = $"{projectId}:{Data01}",
                    ProjectRef = projectId,
                    DataId = Data01,
                    OwnerRef = User01,
                    FileUrl = $"/{projectId}/{User01}_{Data01}.csv?t={DateTime.UtcNow.ToFileTime()}",
                    MimeType = "text/csv",
                    SkipRows = 0,
                }
            );
            TrainingDataService
                .GetTextsAsync(
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<IEnumerable<string>>(),
                    Arg.Any<IList<ISFText>>(),
                    Arg.Any<IList<ISFText>>()
                )
                .Returns(args =>
                {
                    ((List<ISFText>)args[3]).Add(GetMockTrainingData(true));
                    ((List<ISFText>)args[4]).Add(GetMockTrainingData());
                    return Task.CompletedTask;
                });
            if (existingData)
            {
                if (projectId != Project02)
                {
                    throw new ArgumentException(@"You can only set existing data for Project02", nameof(projectId));
                }

                TranslationEnginesClient
                    .GetAsync(TranslationEngine02, CancellationToken.None)
                    .Returns(
                        Task.FromResult(
                            new TranslationEngine
                            {
                                Id = TranslationEngine02,
                                Name = Project02,
                                SourceLanguage = "en",
                                TargetLanguage = "en_US",
                                Type = MachineProjectService.Nmt,
                            }
                        )
                    );
                await ProjectSecrets.UpdateAsync(
                    Project02,
                    u =>
                    {
                        u.Set(p => p.ServalData.PreTranslationEngineId, TranslationEngine02);
                        u.Set(
                            p => p.ServalData.Corpora[Corpus03],
                            new ServalCorpus
                            {
                                PreTranslate = true,
                                AdditionalTrainingData = true,
                                SourceFiles = [new ServalCorpusFile { FileId = File01 }],
                                TargetFiles = [new ServalCorpusFile { FileId = File02 }],
                            }
                        );
                    }
                );
            }
        }

        /// <summary>
        /// Gets the mock training data.
        /// </summary>
        /// <param name="source">
        /// Optional. Default: false.
        /// If <c>true</c>, the first segment's text will be "source"; otherwise if <c>false</c> it will be "target".
        /// </param>
        /// <returns>The training text with segments.</returns>
        public static SFTrainingText GetMockTrainingData(bool source = false) =>
            new SFTrainingText
            {
                Id = $"{Project01}_{Data01}",
                Segments = new List<SFTextSegment>
                {
                    new SFTextSegment(["1"], $"{(source ? "source" : "target")}", false, false, false),
                    new SFTextSegment(["2"], string.Empty, false, false, false),
                    new SFTextSegment(["3"], "all flags", true, true, true),
                },
            };
    }
}
