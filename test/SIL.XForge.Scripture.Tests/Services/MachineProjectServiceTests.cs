using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.FeatureManagement;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.Machine.Corpora;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using MachineProject = SIL.Machine.WebApi.Models.Project;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class MachineProjectServiceTests
{
    private const string Project01 = "project01";
    private const string Project02 = "project02";
    private const string Project03 = "project03";
    private const string User01 = "user01";
    private const string Corpus01 = "corpus01";
    private const string Corpus02 = "corpus02";
    private const string Corpus03 = "corpus03";
    private const string File01 = "file01";
    private const string File02 = "file02";
    private const string TranslationEngine01 = "translationEngine01";
    private const string TranslationEngine02 = "translationEngine02";
    private const string TranslationEngine03 = "translationEngine03";

    [Test]
    public void AddProjectAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.AddProjectAsync(User01, "invalid_project_id", preTranslate: false, CancellationToken.None)
        );
    }

    [Test]
    public async Task AddProjectAsync_ExecutesInProcessMachineAndServal()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        string actual = await env.Service.AddProjectAsync(
            User01,
            Project01,
            preTranslate: false,
            CancellationToken.None
        );

        await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
        Assert.AreEqual(TranslationEngine01, actual);
        Assert.AreEqual(TranslationEngine01, env.ProjectSecrets.Get(Project01).ServalData?.TranslationEngineId);
    }

    [Test]
    public async Task AddProjectAsync_DoesNotCallServalIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { ServalSupport = false });

        // SUT
        await env.Service.AddProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);

        await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task AddProjectAsync_DoesNotExecuteInProcessMachineIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { MachineSupport = false });

        // SUT
        await env.Service.AddProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);

        await env.EngineService.DidNotReceiveWithAnyArgs().AddProjectAsync(Arg.Any<MachineProject>());
    }

    [Test]
    public void BuildProjectAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.BuildProjectAsync(
                    User01,
                    new BuildConfig { ProjectId = "invalid_project_id" },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
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
    public async Task BuildProjectAsync_CallsServalIfTranslationEngineIdPresent()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_BuildsPreTranslationProjects()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesServalProjectIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions());
        string sourceLanguage = env.Projects.Get(Project01).TranslateConfig.Source!.WritingSystem.Tag;
        string targetLanguage = env.Projects.Get(Project01).WritingSystem.Tag;
        Assert.AreNotEqual(sourceLanguage, targetLanguage);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .CreateAsync(
                Arg.Is<TranslationEngineConfig>(
                    t => t.SourceLanguage == sourceLanguage && t.TargetLanguage == targetLanguage
                ),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_SpecifiesTheSameSourceAndTargetLanguageForEcho()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { UseEchoForPreTranslation = true });
        string sourceLanguage = env.Projects.Get(Project01).TranslateConfig.Source!.WritingSystem.Tag;
        string targetLanguage = env.Projects.Get(Project01).WritingSystem.Tag;
        Assert.AreNotEqual(sourceLanguage, targetLanguage);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .CreateAsync(
                Arg.Is<TranslationEngineConfig>(
                    t => t.SourceLanguage == sourceLanguage && t.TargetLanguage == sourceLanguage
                ),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_RunsPreTranslationBuildIfNoTextChangesAndNoPendingBuild()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                BuildIsPending = false,
                PreTranslationBuildIsQueued = true,
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
            }
        );
        await env.SetDataInSync(Project02, true);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);

        // Ensure no methods that update the corpus or files were called
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .UpdateCorpusAsync(
                TranslationEngine02,
                Corpus02,
                Arg.Any<TranslationCorpusUpdateConfig>(),
                CancellationToken.None
            );
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
        await env.DataFilesClient
            .DidNotReceiveWithAnyArgs()
            .UpdateAsync(Arg.Any<string>(), Arg.Any<FileParameter>(), CancellationToken.None);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationQueuedAt);
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotCallServalIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { ServalSupport = false });

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotExecuteInProcessMachineIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { MachineSupport = false });

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.EngineService.DidNotReceive().StartBuildByProjectIdAsync(Project02);
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotBuildServalIfNoLocalChanges()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(Project02);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesTranslationEngineIfNoTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient
            .Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesTranslationEngineOnServalIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );

        // Make the Serval API return the error code for a missing translation engine
        env.TranslationEnginesClient
            .GetAsync(TranslationEngine02, CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // Return the correctly created corpus
        env.TranslationEnginesClient
            .GetCorpusAsync(TranslationEngine01, Arg.Any<string>(), CancellationToken.None)
            .Returns(
                args =>
                    Task.FromResult(
                        new TranslationCorpus
                        {
                            Id = args.ArgAt<string>(1),
                            SourceLanguage = "en",
                            TargetLanguage = "en_US"
                        }
                    )
            );
        ;

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient
            .Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesDataFilesOnServalIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(Project02, preTranslate: true, requiresUpdate: true);

        // Make the Serval API return the error code for a missing translation engine
        env.DataFilesClient
            .UpdateAsync(Arg.Any<string>(), Arg.Any<FileParameter>(), CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.DataFilesClient
            .Received()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_ExecutesInProcessMachine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.EngineService.Received().StartBuildByProjectIdAsync(Project02);
    }

    [Test]
    public async Task BuildProjectAsync_GetsTheSourceAndTargetLanguageIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        SFProject project = env.Projects.Get(Project03);
        Assert.IsNull(project.WritingSystem?.Tag);
        Assert.IsNull(project.TranslateConfig?.Source?.WritingSystem.Tag);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project03 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        project = env.Projects.Get(Project03);
        Assert.IsNotNull(project.WritingSystem.Tag);
        Assert.IsNotNull(project.TranslateConfig.Source?.WritingSystem.Tag);
    }

    [Test]
    public async Task BuildProjectAsync_RecreatesTheProjectOnServalIfTheSourceAndTargetLanguageChange()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );

        // Make the Serval API return the error code for a missing translation engine
        env.TranslationEnginesClient
            .GetAsync(TranslationEngine02, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine02,
                        SourceLanguage = "old_source_language",
                        TargetLanguage = "old_target_language",
                    }
                )
            );

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.Received().DeleteAsync(TranslationEngine02, CancellationToken.None);
        await env.TranslationEnginesClient
            .Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_BuildsPreTranslationProjects()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_RecordsErrors()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });
        ServalApiException ex = ServalApiExceptions.Forbidden;
        env.TranslationEnginesClient.CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None).Throws(ex);

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex);
        env.ExceptionHandler.Received().ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationQueuedAt);
        Assert.AreEqual(ex.Message, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_DoesNotRecordTaskCancellation()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });
        env.TranslationEnginesClient
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None)
            .Throws(new TaskCanceledException());

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        env.ExceptionHandler.DidNotReceive().ReportException(Arg.Any<Exception>());
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationErrorMessage);
    }

    [Test]
    public void RemoveProjectAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.RemoveProjectAsync(
                    User01,
                    "invalid_project_id",
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task RemoveProjectAsync_CallsServalIfTranslationEngineIdPresent()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project02, preTranslate: false, CancellationToken.None);

        // Ensure that the translation engine, corpus and any files are deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine02, CancellationToken.None);
        await env.TranslationEnginesClient
            .Received(1)
            .DeleteCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None);
        await env.DataFilesClient.Received(1).DeleteAsync(File01, CancellationToken.None);
        await env.DataFilesClient.Received(1).DeleteAsync(File02, CancellationToken.None);
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotCallServalIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { ServalSupport = false });

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project02, preTranslate: false, CancellationToken.None);

        // Ensure that the translation engine, corpus and any files were not deleted
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .DeleteAsync(TranslationEngine02, CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(File01, CancellationToken.None);
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotCallServalIfNoTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);

        // Ensure that the translation engine, corpus and any files were not deleted
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .DeleteAsync(TranslationEngine01, CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(TranslationEngine01, Corpus01, CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(File01, CancellationToken.None);
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotExecuteInProcessMachineIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { MachineSupport = false });

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project02, preTranslate: false, CancellationToken.None);

        // Ensure that the in process instance was not called
        await env.EngineService.DidNotReceiveWithAnyArgs().RemoveProjectAsync(Project02);
    }

    [Test]
    public async Task RemoveProjectAsync_ExecutesInProcessMachine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);

        await env.EngineService.Received().RemoveProjectAsync(Project01);
    }

    [Test]
    public void SyncProjectCorporaAsync_ThrowsExceptionWhenProjectSecretMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.SyncProjectCorporaAsync(
                    User01,
                    new BuildConfig { ProjectId = "invalid_project_id" },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_CreatesRemoteCorpusIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { LocalSourceTextHasData = true });
        await env.BeforeFirstSync(Project01);
        string sourceLanguage = env.Projects.Get(Project01).TranslateConfig.Source!.WritingSystem.Tag;
        string targetLanguage = env.Projects.Get(Project01).WritingSystem.Tag;
        Assert.AreNotEqual(sourceLanguage, targetLanguage);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.TranslationEnginesClient
            .Received(1)
            .AddCorpusAsync(
                Arg.Any<string>(),
                Arg.Is<TranslationCorpusConfig>(
                    t => t.SourceLanguage == sourceLanguage && t.TargetLanguage == targetLanguage
                ),
                CancellationToken.None
            );
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .Received(1)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project01).ServalData?.Corpora[Corpus01].SourceFiles.Count);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_CreatesRemoteCorpusWithTheSameSourceAndTargetLanguageForEcho()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, UseEchoForPreTranslation = true }
        );
        await env.BeforeFirstSync(Project01);
        string sourceLanguage = env.Projects.Get(Project01).TranslateConfig.Source!.WritingSystem.Tag;
        string targetLanguage = env.Projects.Get(Project01).WritingSystem.Tag;
        Assert.AreNotEqual(sourceLanguage, targetLanguage);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project01 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.TranslationEnginesClient
            .Received(1)
            .AddCorpusAsync(
                Arg.Any<string>(),
                Arg.Is<TranslationCorpusConfig>(
                    t => t.SourceLanguage == sourceLanguage && t.TargetLanguage == sourceLanguage
                ),
                CancellationToken.None
            );
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .Received(1)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project01).ServalData?.Corpora[Corpus01].SourceFiles.Count);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_CreatesRemoteDataFileForNewLocalText()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { LocalSourceTextHasData = true });
        await env.NoFilesSynced(Project02);

        // SUT
        Assert.AreEqual(0, env.ProjectSecrets.Get(Project02).ServalData?.Corpora[Corpus01].TargetFiles.Count);
        Assert.AreEqual(0, env.ProjectSecrets.Get(Project02).ServalData?.Corpora[Corpus01].SourceFiles.Count);
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .ReceivedWithAnyArgs(1)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, string.Empty, CancellationToken.None);
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData?.Corpora[Corpus01].SourceFiles.Count);
        Assert.AreEqual(0, env.ProjectSecrets.Get(Project02).ServalData?.Corpora[Corpus01].TargetFiles.Count);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotUpdateRemoteIfNoLocalChanges()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(Project02);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotCallServalIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { ServalSupport = false });

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .AddCorpusAsync(TranslationEngine02, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .UpdateCorpusAsync(
                TranslationEngine02,
                Corpus01,
                Arg.Any<TranslationCorpusUpdateConfig>(),
                CancellationToken.None
            );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotUpdateRemoteIfNoLocalText()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.NoFilesSynced(Project02);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
        await env.DataFilesClient
            .DidNotReceiveWithAnyArgs()
            .UpdateAsync(Arg.Any<string>(), Arg.Any<FileParameter>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_FailsLocallyOnRemoteFailure()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { LocalSourceTextHasData = true });
        await env.BeforeFirstSync(Project01);

        // Make adding the corpus to fail due to an API issue
        env.TranslationEnginesClient
            .AddCorpusAsync(TranslationEngine01, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
            .Throws(new BrokenCircuitException());

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
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
    public async Task SyncProjectCorporaAsync_FiltersByTrainingBooks()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(Project02, preTranslate: true);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02, TrainingBooks = { 1, 2 } },
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsFalse(actual);
        await env.TextCorpusFactory
            .Received(1)
            .CreateAsync(
                Arg.Is<string[]>(p => p.Length == 1 && p.First() == Project02),
                TextCorpusType.Target,
                preTranslate: true,
                useAlternateTrainingSource: false,
                Arg.Is<BuildConfig>(
                    b => b.TrainingBooks.Count == 2 && b.TrainingBooks.First() == 1 && b.TrainingBooks.Last() == 2
                )
            );
        await env.TextCorpusFactory
            .Received(1)
            .CreateAsync(
                Arg.Is<string[]>(p => p.Length == 1 && p.First() == Project02),
                TextCorpusType.Source,
                preTranslate: true,
                useAlternateTrainingSource: false,
                Arg.Is<BuildConfig>(
                    b => b.TrainingBooks.Count == 2 && b.TrainingBooks.First() == 1 && b.TrainingBooks.Last() == 2
                )
            );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_UpdatesRemoteCorpusIfLocalTextChanges()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { LocalSourceTextHasData = true });

        // Set sync state so that there is one file and the local copy has changed since last sync
        await env.ProjectSecrets.UpdateAsync(
            Project02,
            u =>
                u.Set(
                    p => p.ServalData.Corpora[Corpus01],
                    new ServalCorpus
                    {
                        SourceFiles = new List<ServalCorpusFile>
                        {
                            new ServalCorpusFile
                            {
                                FileChecksum = "a_previous_checksum",
                                FileId = "File03",
                                TextId = "textId",
                            },
                        },
                        TargetFiles = new List<ServalCorpusFile>(),
                    }
                )
        );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.DataFilesClient
            .DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .ReceivedWithAnyArgs(1)
            .UpdateAsync("File03", Arg.Any<FileParameter>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_AddsAndDeletesLocalSourceAndTargetFilesToRemote()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );

        // Set the sync state so that there are two files on remote that no longer exist locally
        await env.ProjectSecrets.UpdateAsync(
            Project02,
            u =>
                u.Add(
                        p => p.ServalData.Corpora[Corpus01].SourceFiles,
                        new ServalCorpusFile
                        {
                            FileChecksum = "a_previous_checksum",
                            FileId = "File03",
                            TextId = "textId1",
                        }
                    )
                    .Add(
                        p => p.ServalData.Corpora[Corpus01].TargetFiles,
                        new ServalCorpusFile
                        {
                            FileChecksum = "another_previous_checksum",
                            FileId = "File04",
                            TextId = "textId2",
                        }
                    )
        );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.DataFilesClient.Received(1).DeleteAsync("File03", CancellationToken.None);
        await env.DataFilesClient.Received(1).DeleteAsync("File04", CancellationToken.None);
        await env.DataFilesClient
            .Received(2)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, "textId", CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotCrashWhenDeletingAlreadyDeletedRemoteFiles()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // Make the Serval API return the error code for an already deleted file
        env.DataFilesClient.DeleteAsync("File03", CancellationToken.None).Throws(ServalApiExceptions.NotFound);

        // Add one file to the sync state that we think exists remotely, but doesn't, and no longer exists locally
        await env.ProjectSecrets.UpdateAsync(
            Project02,
            u =>
                u.Add(
                    p => p.ServalData.Corpora[Corpus01].SourceFiles,
                    new ServalCorpusFile
                    {
                        FileChecksum = "a_previous_checksum",
                        FileId = "File03",
                        TextId = "textId1",
                    }
                )
        );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.DataFilesClient.Received(1).DeleteAsync("File03", CancellationToken.None);

        // The 404 exception was logged
        env.MockLogger.AssertHasEvent(
            logEvent => logEvent.LogLevel == LogLevel.Information && logEvent.Exception is ServalApiException
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_SynchronizesTheTranslationAndAlternateTrainingSourceCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                AlternateTrainingSourceEnabled = true,
            }
        );
        await env.SetDataInSync(Project02, true);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsTrue(actual);

        // Check for the generation of the training source
        await env.TextCorpusFactory
            .Received(1)
            .CreateAsync(
                Arg.Any<IEnumerable<string>>(),
                TextCorpusType.Source,
                preTranslate: true,
                useAlternateTrainingSource: false,
                Arg.Any<BuildConfig>()
            );

        // Check for the generation of the alternate training source
        await env.TextCorpusFactory
            .Received(1)
            .CreateAsync(
                Arg.Any<IEnumerable<string>>(),
                TextCorpusType.Source,
                preTranslate: true,
                useAlternateTrainingSource: true,
                Arg.Any<BuildConfig>()
            );

        // The target is shared between the two corpora, so it will only be generated once
        await env.TextCorpusFactory
            .Received(1)
            .CreateAsync(
                Arg.Any<IEnumerable<string>>(),
                TextCorpusType.Target,
                preTranslate: true,
                useAlternateTrainingSource: false,
                Arg.Any<BuildConfig>()
            );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_RecreatesDeletedCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true, }
        );
        await env.SetDataInSync(Project02);

        // Make the Serval API return the error code for a missing translation engine
        env.TranslationEnginesClient
            .GetCorpusAsync(TranslationEngine02, Arg.Any<string>(), CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.TranslationEnginesClient
            .Received(1)
            .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .UpdateCorpusAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<TranslationCorpusUpdateConfig>(),
                CancellationToken.None
            );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_RecreatesCorporaWhenLanguageChanges()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true, }
        );
        await env.SetDataInSync(Project02);

        // Make the Serval API return the error code for a missing translation engine
        env.TranslationEnginesClient
            .GetCorpusAsync(TranslationEngine02, Arg.Any<string>(), CancellationToken.None)
            .Returns(
                args =>
                    Task.FromResult(
                        new TranslationCorpus
                        {
                            Id = args.ArgAt<string>(1),
                            SourceLanguage = "fr",
                            TargetLanguage = "de"
                        }
                    )
            );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.TranslationEnginesClient
            .Received(1)
            .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient
            .Received(1)
            .DeleteCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .UpdateCorpusAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<TranslationCorpusUpdateConfig>(),
                CancellationToken.None
            );
    }

    private class TestEnvironmentOptions
    {
        public bool BuildIsPending { get; init; }
        public bool PreTranslationBuildIsQueued { get; init; }
        public bool UseEchoForPreTranslation { get; init; }
        public bool MachineSupport { get; init; } = true;
        public bool ServalSupport { get; init; } = true;
        public bool LocalSourceTextHasData { get; init; }
        public bool LocalTargetTextHasData { get; init; }
        public bool AlternateTrainingSourceEnabled { get; init; }
    }

    private class TestEnvironment
    {
        public TestEnvironment(TestEnvironmentOptions? options = null)
        {
            options ??= new TestEnvironmentOptions();
            EngineService = Substitute.For<IEngineService>();
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            MockLogger = new MockLogger<MachineProjectService>();
            DataFilesClient = Substitute.For<IDataFilesClient>();
            DataFilesClient
                .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None)
                .Returns(Task.FromResult(new DataFile { Id = File01 }));
            DataFilesClient
                .UpdateAsync(Arg.Any<string>(), Arg.Any<FileParameter>())
                .Returns(args => Task.FromResult(new DataFile { Id = args.ArgAt<string>(0) }));
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            TranslationEnginesClient
                .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
                .Returns(Task.FromResult(new TranslationCorpus { Id = Corpus01 }));
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
                            SourceLanguage = "en_US",
                            TargetLanguage = "en_GB",
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
                            SourceLanguage = "en",
                            TargetLanguage = "en_US",
                        }
                    )
                );
            TranslationEnginesClient
                .GetCorpusAsync(TranslationEngine01, Arg.Any<string>(), CancellationToken.None)
                .Returns(
                    args =>
                        Task.FromResult(
                            new TranslationCorpus
                            {
                                Id = args.ArgAt<string>(1),
                                SourceLanguage = "en_US",
                                TargetLanguage = "en_GB"
                            }
                        )
                );
            TranslationEnginesClient
                .GetCorpusAsync(TranslationEngine02, Arg.Any<string>(), CancellationToken.None)
                .Returns(
                    args =>
                        Task.FromResult(
                            new TranslationCorpus
                            {
                                Id = args.ArgAt<string>(1),
                                SourceLanguage = "en",
                                TargetLanguage = "en_US"
                            }
                        )
                );
            TranslationEnginesClient
                .GetAsync(TranslationEngine03, CancellationToken.None)
                .Returns(
                    Task.FromResult(
                        new TranslationEngine
                        {
                            Id = TranslationEngine03,
                            SourceLanguage = "en",
                            TargetLanguage = "en",
                        }
                    )
                );
            TranslationEnginesClient
                .UpdateCorpusAsync(
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<TranslationCorpusUpdateConfig>(),
                    CancellationToken.None
                )
                .Returns(args => Task.FromResult(new TranslationCorpus { Id = args.ArgAt<string>(1) }));
            if (options.BuildIsPending)
            {
                TranslationEnginesClient
                    .GetCurrentBuildAsync(Arg.Any<string>(), null, CancellationToken.None)
                    .Returns(
                        Task.FromResult(
                            new TranslationBuild
                            {
                                Pretranslate = new List<PretranslateCorpus> { new PretranslateCorpus() },
                            }
                        )
                    );
            }
            else
            {
                TranslationEnginesClient
                    .GetCurrentBuildAsync(Arg.Any<string>(), null, CancellationToken.None)
                    .ThrowsAsync(ServalApiExceptions.NoContent);
            }

            var paratextService = Substitute.For<IParatextService>();
            paratextService.GetLanguageId(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns("en");
            TextCorpusFactory = Substitute.For<ISFTextCorpusFactory>();
            if (options.LocalSourceTextHasData && options.LocalTargetTextHasData)
            {
                TextCorpusFactory
                    .CreateAsync(
                        Arg.Any<IEnumerable<string>>(),
                        Arg.Any<TextCorpusType>(),
                        Arg.Any<bool>(),
                        Arg.Any<bool>(),
                        Arg.Any<BuildConfig>()
                    )
                    .Returns(MockTextCorpus);
            }
            else if (options.LocalSourceTextHasData)
            {
                TextCorpusFactory
                    .CreateAsync(
                        Arg.Any<IEnumerable<string>>(),
                        TextCorpusType.Source,
                        Arg.Any<bool>(),
                        Arg.Any<bool>(),
                        Arg.Any<BuildConfig>()
                    )
                    .Returns(MockTextCorpus);
            }
            else if (options.LocalTargetTextHasData)
            {
                TextCorpusFactory
                    .CreateAsync(
                        Arg.Any<IEnumerable<string>>(),
                        TextCorpusType.Target,
                        Arg.Any<bool>(),
                        Arg.Any<bool>(),
                        Arg.Any<BuildConfig>()
                    )
                    .Returns(MockTextCorpus);
            }

            var featureManager = Substitute.For<IFeatureManager>();
            featureManager
                .IsEnabledAsync(FeatureFlags.UseEchoForPreTranslation)
                .Returns(Task.FromResult(options.UseEchoForPreTranslation));
            featureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(options.ServalSupport));
            featureManager
                .IsEnabledAsync(FeatureFlags.MachineInProcess)
                .Returns(Task.FromResult(options.MachineSupport));

            ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                new[]
                {
                    new SFProjectSecret { Id = Project01 },
                    new SFProjectSecret
                    {
                        Id = Project02,
                        ServalData = new ServalData
                        {
                            PreTranslationJobId = options.PreTranslationBuildIsQueued ? "jobId" : null,
                            PreTranslationQueuedAt = options.PreTranslationBuildIsQueued ? DateTime.UtcNow : null,
                            TranslationEngineId = TranslationEngine02,
                            Corpora = new Dictionary<string, ServalCorpus>
                            {
                                {
                                    Corpus01,
                                    new ServalCorpus
                                    {
                                        PreTranslate = false,
                                        AlternateTrainingSource = false,
                                        SourceFiles = new List<ServalCorpusFile>
                                        {
                                            new ServalCorpusFile { FileId = File01 },
                                        },
                                        TargetFiles = new List<ServalCorpusFile>
                                        {
                                            new ServalCorpusFile { FileId = File02 },
                                        },
                                    }
                                },
                                {
                                    Corpus02,
                                    new ServalCorpus
                                    {
                                        PreTranslate = true,
                                        AlternateTrainingSource = false,
                                        SourceFiles = new List<ServalCorpusFile>
                                        {
                                            new ServalCorpusFile { FileId = File01 },
                                        },
                                        TargetFiles = new List<ServalCorpusFile>
                                        {
                                            new ServalCorpusFile { FileId = File02 },
                                        },
                                    }
                                },
                                {
                                    Corpus03,
                                    new ServalCorpus
                                    {
                                        PreTranslate = true,
                                        AlternateTrainingSource = true,
                                        SourceFiles = new List<ServalCorpusFile>
                                        {
                                            new ServalCorpusFile { FileId = File01 },
                                        },
                                        TargetFiles = new List<ServalCorpusFile>
                                        {
                                            new ServalCorpusFile { FileId = File02 },
                                        },
                                    }
                                },
                            },
                        },
                    },
                    new SFProjectSecret { Id = Project03 },
                }
            );

            var userSecrets = new MemoryRepository<UserSecret>(new[] { new UserSecret { Id = User01 } });

            Projects = new MemoryRepository<SFProject>(
                new[]
                {
                    new SFProject
                    {
                        Id = Project01,
                        Name = "project01",
                        ShortName = "P01",
                        CheckingConfig = new CheckingConfig { ShareEnabled = false },
                        UserRoles = new Dictionary<string, string>(),
                        TranslateConfig = new TranslateConfig
                        {
                            TranslationSuggestionsEnabled = true,
                            Source = new TranslateSource
                            {
                                ProjectRef = Project02,
                                WritingSystem = new WritingSystem { Tag = "en_US" },
                            },
                        },
                        WritingSystem = new WritingSystem { Tag = "en_GB" },
                    },
                    new SFProject
                    {
                        Id = Project02,
                        Name = "project02",
                        ShortName = "P02",
                        CheckingConfig = new CheckingConfig { ShareEnabled = false },
                        UserRoles = new Dictionary<string, string>(),
                        TranslateConfig = new TranslateConfig
                        {
                            TranslationSuggestionsEnabled = true,
                            Source = new TranslateSource
                            {
                                ProjectRef = Project03,
                                WritingSystem = new WritingSystem { Tag = "en" },
                            },
                            DraftConfig = new DraftConfig
                            {
                                AlternateTrainingSourceEnabled = options.AlternateTrainingSourceEnabled,
                                AlternateTrainingSource = new TranslateSource { ProjectRef = Project01 },
                            },
                        },
                        WritingSystem = new WritingSystem { Tag = "en_US" },
                    },
                    new SFProject
                    {
                        Id = Project03,
                        Name = "project03",
                        ShortName = "P03",
                        CheckingConfig = new CheckingConfig { ShareEnabled = false },
                        UserRoles = new Dictionary<string, string>(),
                        TranslateConfig = new TranslateConfig
                        {
                            TranslationSuggestionsEnabled = true,
                            Source = new TranslateSource { ProjectRef = Project01 },
                        },
                    },
                }
            );

            var realtimeService = new SFMemoryRealtimeService();
            realtimeService.AddRepository("sf_projects", OTType.Json0, Projects);

            Service = new MachineProjectService(
                DataFilesClient,
                EngineService,
                ExceptionHandler,
                featureManager,
                MockLogger,
                paratextService,
                ProjectSecrets,
                realtimeService,
                TextCorpusFactory,
                TranslationEnginesClient,
                userSecrets
            );
        }

        private static string MockTextCorpusChecksum => StringUtils.ComputeMd5Hash("segRef\tsegment01\n");

        private static Task<ITextCorpus> MockTextCorpus =>
            Task.FromResult<ITextCorpus>(
                new MockTextCorpus
                {
                    Texts = new[]
                    {
                        new MockText
                        {
                            Id = "textId",
                            Segments = new List<TextSegment>
                            {
                                new TextSegment(
                                    "textId",
                                    "segRef",
                                    new string[] { "segment01" },
                                    false,
                                    false,
                                    false,
                                    false
                                ),
                            },
                        },
                    },
                }
            );

        public MachineProjectService Service { get; }
        public IEngineService EngineService { get; }
        public IDataFilesClient DataFilesClient { get; }
        public ISFTextCorpusFactory TextCorpusFactory { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
        public MemoryRepository<SFProject> Projects { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public MockLogger<MachineProjectService> MockLogger { get; }
        public IExceptionHandler ExceptionHandler { get; }

        public async Task SetDataInSync(string projectId, bool preTranslate = false, bool requiresUpdate = false) =>
            await ProjectSecrets.UpdateAsync(
                projectId,
                u =>
                {
                    u.Set(
                        p => p.ServalData.Corpora[Corpus01],
                        new ServalCorpus
                        {
                            SourceFiles = new List<ServalCorpusFile>
                            {
                                new ServalCorpusFile
                                {
                                    FileChecksum = requiresUpdate ? "old_checksum" : MockTextCorpusChecksum,
                                    FileId = File01,
                                    TextId = "textId",
                                },
                            },
                            TargetFiles = new List<ServalCorpusFile>
                            {
                                new ServalCorpusFile
                                {
                                    FileChecksum = requiresUpdate ? "old_checksum" : MockTextCorpusChecksum,
                                    FileId = File02,
                                    TextId = "textId",
                                },
                            },
                            PreTranslate = preTranslate,
                        }
                    );
                    if (preTranslate)
                    {
                        u.Set(p => p.ServalData.PreTranslationEngineId, TranslationEngine02);
                    }
                }
            );

        public async Task NoFilesSynced(string projectId) =>
            await ProjectSecrets.UpdateAsync(
                projectId,
                u =>
                {
                    List<ServalCorpusFile> noFiles = new List<ServalCorpusFile>();
                    u.Set(p => p.ServalData.Corpora[Corpus01].SourceFiles, noFiles);
                    u.Set(p => p.ServalData.Corpora[Corpus01].TargetFiles, noFiles);
                }
            );

        public async Task BeforeFirstSync(string projectId) =>
            await ProjectSecrets.UpdateAsync(
                projectId,
                u => u.Set(p => p.ServalData, new ServalData { TranslationEngineId = TranslationEngine01 })
            );
    }
}
