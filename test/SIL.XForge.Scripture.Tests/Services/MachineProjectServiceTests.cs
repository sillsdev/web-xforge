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
using NUnit.Framework;
using Polly.CircuitBreaker;
using Serval.Client;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class MachineProjectServiceTests
{
    private const string Paratext01 = "paratext01";
    private const string Paratext02 = "paratext02";
    private const string Paratext03 = "paratext03";
    private const string Project01 = "project01";
    private const string Project02 = "project02";
    private const string Project03 = "project03";
    private const string User01 = "user01";
    private const string Corpus01 = "corpus01";
    private const string Corpus02 = "corpus02";
    private const string Corpus03 = "corpus03";
    private const string Data01 = "data01";
    private const string File01 = "file01";
    private const string File02 = "file02";
    private const string TranslationEngine01 = "translationEngine01";
    private const string TranslationEngine02 = "translationEngine02";
    private const string LanguageTag = "he";

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
    public async Task AddProjectAsync_DoesNotCreateIfLanguageMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        string actual = await env.Service.AddProjectAsync(
            User01,
            Project03,
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsEmpty(actual);
    }

    [Test]
    public async Task BuildProjectAsync_UsesTheUpdatedLearningRateForServal()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });
        env.FeatureManager.IsEnabledAsync(FeatureFlags.UpdatedLearningRateForServal).Returns(Task.FromResult(true));

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01, FastTraining = true },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine01,
                Arg.Is<TranslationBuildConfig>(b => ((int)((JObject)b.Options)["train_params"]["max_steps"]) == 5000),
                CancellationToken.None
            );
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
    public async Task BuildProjectAsync_ThrowsExceptionWhenSourceMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.Projects.UpdateAsync(Project01, op => op.Unset(p => p.TranslateConfig.Source));

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
    public async Task BuildProjectAsync_ThrowsExceptionWhenSourceRemoved()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { HasTranslationEngineForSmt = true });
        await env.Projects.UpdateAsync(Project02, op => op.Unset(p => p.TranslateConfig.Source));

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.BuildProjectAsync(
                    User01,
                    new BuildConfig { ProjectId = Project02 },
                    preTranslate: false,
                    CancellationToken.None
                )
        );
    }

    [Test]
    public async Task BuildProjectAsync_CallsServalIfTranslationEngineIdPresent()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { HasTranslationEngineForSmt = true });

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
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

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_SendsAdditionalTrainingData()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupTrainingDataAsync(Project01);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01, TrainingDataFiles = { Data01 } },
            preTranslate: true,
            CancellationToken.None
        );

        // Ensure that the additional texts were retrieved
        await env
            .TrainingDataService.Received()
            .GetTextsAsync(
                User01,
                Project01,
                Arg.Is<IEnumerable<string>>(d => d.Contains(Data01)),
                Arg.Any<IList<ISFText>>(),
                Arg.Any<IList<ISFText>>()
            );

        // Ensure that the additional files corpus was synced, and the build started
        await env
            .TranslationEnginesClient.Received()
            .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        Assert.IsNotEmpty(
            env.ProjectSecrets.Get(Project01)
                .ServalData!.Corpora.First(c => c.Value.PreTranslate && c.Value.AdditionalTrainingData)
                .Key
        );
        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                Arg.Any<string>(),
                Arg.Is<TranslationBuildConfig>(b => b.TrainOn == null),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_SendsAdditionalTrainingDataWhenFilesPreviouslyUploaded()
    {
        // Set up test environment
        var env = new TestEnvironment();
        await env.SetupTrainingDataAsync(Project02, existingData: true);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02, TrainingDataFiles = { Data01 } },
            preTranslate: true,
            CancellationToken.None
        );

        // Ensure that the additional texts were retrieved
        await env
            .TrainingDataService.Received()
            .GetTextsAsync(
                User01,
                Project02,
                Arg.Is<IEnumerable<string>>(d => d.Contains(Data01)),
                Arg.Any<IList<ISFText>>(),
                Arg.Any<IList<ISFText>>()
            );

        // Ensure that the previous files with different IDs were deleted, and new ones added
        await env.DataFilesClient.Received(2).DeleteAsync(File02);
        await env
            .DataFilesClient.Received()
            .CreateAsync(Arg.Any<FileParameter>(), Arg.Any<FileFormat>(), Data01, CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_SendsAdditionalTrainingDataWithAlternateSource()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                AlternateTrainingSourceEnabled = true,
                AlternateTrainingSourceConfigured = true,
            }
        );
        await env.SetupTrainingDataAsync(Project02);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02, TrainingDataFiles = { Data01 } },
            preTranslate: true,
            CancellationToken.None
        );

        // Ensure that the additional texts were retrieved
        await env
            .TrainingDataService.Received()
            .GetTextsAsync(
                User01,
                Project02,
                Arg.Is<IEnumerable<string>>(d => d.Contains(Data01)),
                Arg.Any<IList<ISFText>>(),
                Arg.Any<IList<ISFText>>()
            );

        // Ensure that the build passed the additional files corpus in the train_on parameter
        string corpusId = env
            .ProjectSecrets.Get(Project02)
            .ServalData!.Corpora.First(c => c.Value.PreTranslate && c.Value.AdditionalTrainingData)
            .Key;
        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                Arg.Any<string>(),
                Arg.Is<TranslationBuildConfig>(b => b.TrainOn.Any(c => c.CorpusId == corpusId)),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_PassesFastTrainingConfiguration()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01, FastTraining = true },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine01,
                Arg.Is<TranslationBuildConfig>(b => ((int)((JObject)b.Options)["max_steps"]) == 20),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_MergesFastTrainingConfiguration()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { BuildIsPending = false, ServalConfig = @"{""max_steps"":35}" }
        );

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project01, FastTraining = true },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine01,
                Arg.Is<TranslationBuildConfig>(b => ((int)((JObject)b.Options)["max_steps"]) == 20),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_PassesServalConfig()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { BuildIsPending = false, ServalConfig = @"{""max_steps"":35}" }
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
    public async Task BuildProjectAsync_CreatesServalProjectIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
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

        await env
            .TranslationEnginesClient.Received()
            .CreateAsync(
                Arg.Is<TranslationEngineConfig>(t =>
                    t.SourceLanguage == sourceLanguage && t.TargetLanguage == targetLanguage
                ),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_CreatesServalProjectIfRemoved()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient.GetAsync(TranslationEngine02, CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);
        string sourceLanguage = env.Projects.Get(Project02).TranslateConfig.Source!.WritingSystem.Tag;
        string targetLanguage = env.Projects.Get(Project02).WritingSystem.Tag;
        Assert.AreNotEqual(sourceLanguage, targetLanguage);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .CreateAsync(
                Arg.Is<TranslationEngineConfig>(t =>
                    t.SourceLanguage == sourceLanguage && t.TargetLanguage == targetLanguage
                ),
                CancellationToken.None
            );
    }

    [Test]
    public void BuildProjectAsync_DirectoryNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });
        env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(false);

        // SUT
        Assert.ThrowsAsync<DirectoryNotFoundException>(
            () =>
                env.Service.BuildProjectAsync(
                    User01,
                    new BuildConfig { ProjectId = Project01 },
                    preTranslate: true,
                    CancellationToken.None
                )
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

        await env
            .TranslationEnginesClient.Received()
            .CreateAsync(
                Arg.Is<TranslationEngineConfig>(t =>
                    t.SourceLanguage == sourceLanguage && t.TargetLanguage == sourceLanguage
                ),
                CancellationToken.None
            );
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

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env
            .TranslationEnginesClient.Received()
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
        env.TranslationEnginesClient.GetAsync(TranslationEngine02, CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // Return the correctly created corpus
        env.TranslationEnginesClient.GetCorpusAsync(TranslationEngine01, Arg.Any<string>(), CancellationToken.None)
            .Returns(args =>
                Task.FromResult(
                    new TranslationCorpus
                    {
                        Id = args.ArgAt<string>(1),
                        SourceLanguage = "en",
                        TargetLanguage = "en_US",
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

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env
            .TranslationEnginesClient.Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesDataFilesOnServalIfMissing_Paratext()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(Project02, preTranslate: true, uploadParatextZipFile: true);

        // Make the Serval API return the error code for a missing data file
        env.DataFilesClient.UpdateAsync(Arg.Any<string>(), Arg.Any<FileParameter>(), CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env
            .DataFilesClient.Received()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Paratext, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesDataFilesOnServalIfMissing_Text()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(Project02, preTranslate: true);

        // Make the Serval API return the error code for a missing data file
        env.DataFilesClient.GetAsync(Arg.Any<string>(), CancellationToken.None).Throws(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env
            .DataFilesClient.Received()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Paratext, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_GetsTheSourceAndTargetLanguageIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        SFProject project = env.Projects.Get(Project03);
        Assert.IsNull(project.WritingSystem.Tag);
        Assert.IsNull(project.TranslateConfig.Source?.WritingSystem.Tag);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project03 },
            preTranslate: false,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
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
            new TestEnvironmentOptions
            {
                HasTranslationEngineForSmt = true,
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
            }
        );

        // Make the Serval API return the translation engine
        env.TranslationEnginesClient.GetAsync(TranslationEngine02, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine02,
                        Name = Project02,
                        SourceLanguage = "old_source_language",
                        TargetLanguage = "old_target_language",
                        Type = MachineProjectService.SmtTransfer,
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

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.Received().DeleteAsync(TranslationEngine02, CancellationToken.None);
        await env
            .TranslationEnginesClient.Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_RecreatesTheProjectIfAlternateSourceLanguageDoesNotMatch()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { AlternateSourceEnabled = true, AlternateSourceConfigured = true }
        );
        await env.SetDataInSync(Project02, preTranslate: true);
        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        string newEngineId = TranslationEngine01;
        string oldEngineId = TranslationEngine02;
        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(newEngineId, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.Received().DeleteAsync(oldEngineId, CancellationToken.None);
        await env
            .TranslationEnginesClient.Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotRecreateTheProjectIfSourceLanguageMatchesAndAlternateSourceDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { AlternateSourceEnabled = false, AlternateSourceConfigured = true }
        );
        await env.SetDataInSync(Project02, preTranslate: true);
        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.DidNotReceive().DeleteAsync(Arg.Any<string>(), CancellationToken.None);
        await env
            .TranslationEnginesClient.DidNotReceive()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_ClearsAssociatedCorporaReferencesIfTheTranslationEngineTypeIsIncorrect()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            uploadParatextZipFile: false,
            alternateTrainingSource: true
        );

        // Make the Serval API return the old translation engine with an incorrect type
        env.TranslationEnginesClient.GetAsync(TranslationEngine02, CancellationToken.None)
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

        // And the new translation engine correctly
        env.TranslationEnginesClient.GetAsync(TranslationEngine01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationEngine
                    {
                        Id = TranslationEngine01,
                        Name = Project02,
                        SourceLanguage = "en",
                        TargetLanguage = "en_US",
                        Type = MachineProjectService.Nmt,
                    }
                )
            );

        // Check that we have more than one pre-translate corpora
        Assert.AreEqual(2, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        // The old engine should not be deleted, as it is an incorrect association
        await env.TranslationEnginesClient.DidNotReceive().DeleteAsync(TranslationEngine02, CancellationToken.None);
        await env
            .TranslationEnginesClient.Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);

        // Ensure we have just one pre-translate corpora
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));
    }

    [Test]
    public async Task BuildProjectAsync_ClearsAlternateSourceCorporaIfDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                AlternateTrainingSourceEnabled = false,
            }
        );
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            uploadParatextZipFile: false,
            alternateTrainingSource: true
        );

        // Check that we have more than one pre-translate corpora
        Assert.AreEqual(2, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        // The old corpus and its files should be deleted
        await env
            .TranslationEnginesClient.Received()
            .DeleteCorpusAsync(TranslationEngine02, Corpus02, deleteFiles: true, CancellationToken.None);

        // Ensure we have just one pre-translate corpora
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));
    }

    [Test]
    public async Task BuildProjectAsync_UploadParatextZipSpecifiesBookIds()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });
        await env.SetDataInSync(Project01, preTranslate: true, uploadParatextZipFile: true);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig
            {
                ProjectId = Project01,
                TrainingBooks = { 1, 2 },
                TranslationBooks = { 3, 4 },
            },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine01,
                Arg.Is<TranslationBuildConfig>(b =>
                    b.TrainOn.Count == 1
                    && b.TrainOn.First().CorpusId == Corpus01
                    && b.TrainOn.First().ScriptureRange == "GEN;EXO"
                    && b.TrainOn.First().TextIds == null
                    && b.Pretranslate.Count == 1
                    && b.Pretranslate.First().CorpusId == Corpus01
                    && b.Pretranslate.First().ScriptureRange == "LEV;NUM"
                    && b.Pretranslate.First().TextIds == null
                ),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_UploadParatextZipSpecifiesAlternateTrainingSourceBookIds()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                BuildIsPending = false,
                AlternateTrainingSourceConfigured = true,
                AlternateTrainingSourceEnabled = true,
            }
        );
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            uploadParatextZipFile: true,
            alternateTrainingSource: true
        );

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig
            {
                ProjectId = Project02,
                TrainingBooks = { 1, 2 },
                TranslationBooks = { 3, 4 },
            },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine02,
                Arg.Is<TranslationBuildConfig>(b =>
                    b.TrainOn.Count == 1
                    && b.TrainOn.First().CorpusId == Corpus02
                    && b.TrainOn.First().ScriptureRange == "GEN;EXO"
                    && b.TrainOn.First().TextIds == null
                    && b.Pretranslate.Count == 1
                    && b.Pretranslate.First().CorpusId == Corpus01
                    && b.Pretranslate.First().ScriptureRange == "LEV;NUM"
                    && b.Pretranslate.First().TextIds == null
                ),
                CancellationToken.None
            );
    }

    [TestCase(null)]
    [TestCase("")]
    [TestCase(" ")]
    public async Task BuildProjectAsync_SpecifiesNullScriptureRange(string? scriptureRange)
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig
            {
                ProjectId = Project01,
                TrainingScriptureRange = scriptureRange,
                TranslationScriptureRange = scriptureRange,
            },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine01,
                Arg.Is<TranslationBuildConfig>(b =>
                    b.Pretranslate.Count == 1
                    && b.Pretranslate.First().ScriptureRange == null
                    && b.Pretranslate.First().TextIds == null
                    && b.TrainOn.Count == 1
                    && b.TrainOn.First().ScriptureRange == null
                    && b.TrainOn.First().TextIds!.Count == 0
                ),
                CancellationToken.None
            );
    }

    [TestCase(null)]
    [TestCase("")]
    [TestCase(" ")]
    public async Task BuildProjectAsync_SpecifiesNullScriptureRangeForAlternateTrainingSource(string? scriptureRange)
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                AlternateTrainingSourceEnabled = true,
                AlternateTrainingSourceConfigured = true,
            }
        );
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            uploadParatextZipFile: true,
            alternateTrainingSource: true
        );

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig
            {
                ProjectId = Project02,
                TrainingScriptureRange = scriptureRange,
                TranslationScriptureRange = scriptureRange,
            },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine02,
                Arg.Is<TranslationBuildConfig>(b =>
                    b.Pretranslate.Count == 1
                    && b.Pretranslate.First().ScriptureRange == null
                    && b.Pretranslate.First().TextIds == null
                    && b.TrainOn.Count == 1
                    && b.TrainOn.First().ScriptureRange == null
                    && b.TrainOn.First().TextIds!.Count == 0
                ),
                CancellationToken.None
            );
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

        await env
            .TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_RecordsDataNotFoundExceptionAsWarning()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            new BuildConfig { ProjectId = "project_does_not_exist" },
            preTranslate: false,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.Message.Contains("DataNotFoundException", StringComparison.OrdinalIgnoreCase)
            && logEvent.LogLevel == LogLevel.Warning
        );
        env.ExceptionHandler.DidNotReceive().ReportException(Arg.Any<Exception>());
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

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Error);
        env.ExceptionHandler.Received().ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationQueuedAt);
        Assert.AreEqual(ex.Message, env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_DoesNotUpdatePreTranslationSecretsOnSmtErrors()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });
        ServalApiException ex = ServalApiExceptions.Forbidden;
        env.TranslationEnginesClient.CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None).Throws(ex);

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );

        env.MockLogger.AssertHasEvent(logEvent => logEvent.Exception == ex && logEvent.LogLevel == LogLevel.Error);
        env.ExceptionHandler.Received().ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_DoesNotRecordBuildInProgressErrors()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });
        ServalApiException ex = ServalApiExceptions.BuildInProgress;
        env.TranslationEnginesClient.StartBuildAsync(
                Arg.Any<string>(),
                Arg.Any<TranslationBuildConfig>(),
                CancellationToken.None
            )
            .Throws(ex);

        // SUT
        await env.Service.BuildProjectForBackgroundJobAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env
            .TranslationEnginesClient.Received(1)
            .StartBuildAsync(Arg.Any<string>(), Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        env.MockLogger.AssertNoEvent(logEvent => logEvent.Exception == ex);
        env.ExceptionHandler.DidNotReceiveWithAnyArgs().ReportException(ex);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationQueuedAt);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationErrorMessage);
    }

    [Test]
    public async Task BuildProjectForBackgroundJobAsync_DoesNotRecordTaskCancellation()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { BuildIsPending = false });
        env.TranslationEnginesClient.CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None)
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
    public async Task GetTranslationEngineTypeAsync_Echo()
    {
        var env = new TestEnvironment(new TestEnvironmentOptions { UseEchoForPreTranslation = true });

        // SUT
        var actual = await env.Service.GetTranslationEngineTypeAsync(preTranslate: true);
        Assert.AreEqual(MachineProjectService.Echo, actual);
    }

    [Test]
    public async Task GetTranslationEngineTypeAsync_Nmt()
    {
        var env = new TestEnvironment();

        // SUT
        var actual = await env.Service.GetTranslationEngineTypeAsync(preTranslate: true);
        Assert.AreEqual(MachineProjectService.Nmt, actual);
    }

    [Test]
    public async Task GetTranslationEngineTypeAsync_Smt()
    {
        var env = new TestEnvironment();

        // SUT
        var actual = await env.Service.GetTranslationEngineTypeAsync(preTranslate: false);
        Assert.AreEqual(MachineProjectService.SmtTransfer, actual);
    }

    [Test]
    public async Task GetProjectZipAsync_Success()
    {
        var env = new TestEnvironment();
        MemoryStream outputStream = new MemoryStream();

        // SUT
        string actual = await env.Service.GetProjectZipAsync(Project01, outputStream, CancellationToken.None);
        Assert.AreEqual("P01.zip", actual);

        // Validate the zip file
        outputStream.Seek(0, SeekOrigin.Begin);
        using var archive = new ZipArchive(outputStream, ZipArchiveMode.Read);
        Assert.AreEqual(1, archive.Entries.Count);
        Assert.AreEqual("file", archive.Entries[0].FullName);
    }

    [Test]
    public void GetProjectZipAsync_ThrowsExceptionWhenProjectDirectoryMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(false);
        MemoryStream outputStream = new MemoryStream();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.GetProjectZipAsync(Project01, outputStream, CancellationToken.None)
        );
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
        var env = new TestEnvironment(new TestEnvironmentOptions { HasTranslationEngineForSmt = true });

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project02, preTranslate: false, CancellationToken.None);

        // Ensure that the translation engine, corpus and any files are deleted
        await env.TranslationEnginesClient.Received(1).DeleteAsync(TranslationEngine02, CancellationToken.None);
        await env
            .TranslationEnginesClient.Received(1)
            .DeleteCorpusAsync(TranslationEngine02, Corpus01, deleteFiles: true, CancellationToken.None);
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotCallServalIfNoTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);

        // Ensure that the translation engine, corpus and any files were not deleted
        await env
            .TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteAsync(TranslationEngine01, CancellationToken.None);
        await env
            .TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(TranslationEngine01, Corpus01, deleteFiles: true, CancellationToken.None);
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
        await env
            .TranslationEnginesClient.Received(1)
            .AddCorpusAsync(
                Arg.Any<string>(),
                Arg.Is<TranslationCorpusConfig>(t =>
                    t.SourceLanguage == sourceLanguage && t.TargetLanguage == targetLanguage
                ),
                CancellationToken.None
            );
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env
            .DataFilesClient.Received(2)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Paratext, Project01, CancellationToken.None);
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project01).ServalData?.Corpora[Corpus01].SourceFiles.Count);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotUpdateAlternateTrainingSourceOnSmtBuilds()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                HasTranslationEngineForSmt = true,
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                AlternateTrainingSourceConfigured = true,
                AlternateTrainingSourceEnabled = true,
            }
        );
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            uploadParatextZipFile: false,
            alternateTrainingSource: true
        );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env
            .TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool?>(), CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_FailsLocallyOnRemoteFailure()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { LocalSourceTextHasData = true });
        await env.BeforeFirstSync(Project01);

        // Make adding the corpus to fail due to an API issue
        env.TranslationEnginesClient.AddCorpusAsync(
                TranslationEngine01,
                Arg.Any<TranslationCorpusConfig>(),
                CancellationToken.None
            )
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
    public async Task SyncProjectCorporaAsync_UpdatesRemoteCorpusIfLocalTextChanges()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { HasTranslationEngineForSmt = true, LocalSourceTextHasData = true }
        );

        // Set sync state so that there is one file and the local copy has changed since last sync
        await env.ProjectSecrets.UpdateAsync(
            Project02,
            u =>
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
                                TextId = Project02,
                            },
                        ],
                        TargetFiles =
                        [
                            new ServalCorpusFile
                            {
                                FileChecksum = "old_checksum",
                                FileId = File02,
                                ProjectId = Project02,
                                TextId = Project02,
                            },
                        ],
                        UploadParatextZipFile = true,
                    }
                )
        );

        // Make the Serval API return a data file
        env.DataFilesClient.GetAsync(Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new DataFile { Format = FileFormat.Paratext }));

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env
            .DataFilesClient.DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Paratext, Arg.Any<string>(), CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient.Received(1).UpdateAsync(File01, Arg.Any<FileParameter>(), CancellationToken.None);
        await env.DataFilesClient.Received(1).UpdateAsync(File02, Arg.Any<FileParameter>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_AddsAndDeletesLocalSourceAndTargetFilesToRemote()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                HasTranslationEngineForSmt = true,
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
            }
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
                            ProjectId = Project03,
                            TextId = "textId1",
                        }
                    )
                    .Add(
                        p => p.ServalData.Corpora[Corpus01].TargetFiles,
                        new ServalCorpusFile
                        {
                            FileChecksum = "another_previous_checksum",
                            FileId = "File04",
                            ProjectId = Project01,
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
        await env
            .DataFilesClient.Received(2)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Paratext, Project02, CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotCrashWhenDeletingAlreadyDeletedRemoteFiles()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions { HasTranslationEngineForSmt = true });

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
                        ProjectId = Project03,
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
        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.LogLevel == LogLevel.Information && logEvent.Exception is ServalApiException
        );
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotCrashWhenDeletingMissingAlternateTrainingSourceCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                AlternateTrainingSourceEnabled = false,
            }
        );
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            uploadParatextZipFile: false,
            alternateTrainingSource: true
        );
        ServalApiException ex = ServalApiExceptions.NotFound;
        env.TranslationEnginesClient.DeleteCorpusAsync(
                TranslationEngine02,
                Corpus02,
                deleteFiles: true,
                CancellationToken.None
            )
            .Throws(ex);

        // Check that we have more than one pre-translate corpora
        Assert.AreEqual(2, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsTrue(actual);

        // The old corpus and its files should be deleted
        await env
            .TranslationEnginesClient.Received()
            .DeleteCorpusAsync(TranslationEngine02, Corpus02, deleteFiles: true, CancellationToken.None);

        // Ensure we have just one pre-translate corpora
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));

        // The 404 exception was logged
        env.MockLogger.AssertHasEvent(logEvent =>
            logEvent.LogLevel == LogLevel.Information && logEvent.Exception is ServalApiException
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_SynchronizesTheAlternateSource()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                AlternateSourceEnabled = true,
                AlternateSourceConfigured = true,
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
            }
        );
        await env.SetDataInSync(Project02, preTranslate: true, uploadParatextZipFile: true);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsTrue(actual);

        // Verify that it was just the alternate source, source, and target directories that were read for data
        var project = env.Projects.Get(Project02);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateSource?.ParatextId, Is.EqualTo(Paratext01));
        Assert.That(project.TranslateConfig.Source?.ParatextId, Is.EqualTo(Paratext03));
        env.FileSystemService.Received(1).EnumerateFiles(Arg.Is<string>(path => path.Contains(Paratext01)));
        env.FileSystemService.Received(1).EnumerateFiles(Arg.Is<string>(path => path.Contains(Paratext02)));
        env.FileSystemService.Received(1).EnumerateFiles(Arg.Is<string>(path => path.Contains(Paratext03)));
        env.FileSystemService.Received(3).EnumerateFiles(Arg.Any<string>());
    }

    [Test]
    public async Task SyncProjectCorporaAsync_UsesTheSourceWhenAlternateSourceIsEnabledButNotConfigured()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                AlternateSourceConfigured = false,
                AlternateSourceEnabled = true,
            }
        );
        await env.SetDataInSync(Project02, preTranslate: true, uploadParatextZipFile: true);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsTrue(actual);

        // Verify that it was just the source and target directories that were read for data
        var project = env.Projects.Get(Project02);
        Assert.That(project.TranslateConfig.Source?.ParatextId, Is.EqualTo(Paratext03));
        env.FileSystemService.Received(1).EnumerateFiles(Arg.Is<string>(path => path.Contains(Paratext02)));
        env.FileSystemService.Received(1).EnumerateFiles(Arg.Is<string>(path => path.Contains(Paratext03)));
        env.FileSystemService.Received(2).EnumerateFiles(Arg.Any<string>());
    }

    [Test]
    public async Task SyncProjectCorporaAsync_SynchronizesTheAdditionalTrainingSourceCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                AdditionalTrainingSourceConfigured = true,
            }
        );
        await env.SetDataInSync(Project02, preTranslate: true, uploadParatextZipFile: true);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsTrue(actual);

        // Check for the upload of the source, target, source duplicated as training source, and mixed source
        await env
            .DataFilesClient.Received(4)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Paratext, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_SynchronizesTheAdditionalTrainingSourceIntoTheAlternateTrainingSourceCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                AlternateTrainingSourceConfigured = true,
                AlternateTrainingSourceEnabled = true,
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                AdditionalTrainingSourceConfigured = true,
            }
        );
        await env.SetDataInSync(Project02, preTranslate: true, uploadParatextZipFile: true);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsTrue(actual);

        // Check for the upload of the source, target, alternate training source, and mixed source
        await env
            .DataFilesClient.Received(4)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Paratext, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_RecreatesDeletedCorpora()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                HasTranslationEngineForSmt = true,
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
            }
        );
        await env.SetDataInSync(Project02);

        // Make the Serval API return the error code for a missing corpus
        env.TranslationEnginesClient.GetCorpusAsync(TranslationEngine02, Arg.Any<string>(), CancellationToken.None)
            .Throws(ServalApiExceptions.NotFound);

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env
            .TranslationEnginesClient.Received(1)
            .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        await env
            .TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool?>(), CancellationToken.None);
        await env
            .TranslationEnginesClient.DidNotReceiveWithAnyArgs()
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
            new TestEnvironmentOptions
            {
                HasTranslationEngineForSmt = true,
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
            }
        );
        await env.SetDataInSync(Project02);

        // Make the Serval API return the corpus
        env.TranslationEnginesClient.GetCorpusAsync(TranslationEngine02, Arg.Any<string>(), CancellationToken.None)
            .Returns(args =>
                Task.FromResult(
                    new TranslationCorpus
                    {
                        Id = args.ArgAt<string>(1),
                        SourceLanguage = "fr",
                        TargetLanguage = "de",
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
        await env
            .TranslationEnginesClient.Received(1)
            .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        await env
            .TranslationEnginesClient.Received(1)
            .DeleteCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), deleteFiles: false, CancellationToken.None);
        await env
            .TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .UpdateCorpusAsync(
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<TranslationCorpusUpdateConfig>(),
                CancellationToken.None
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
                        AlternateSource = new TranslateSource { ParatextId = Paratext01 }
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

    private class TestEnvironmentOptions
    {
        public bool AlternateSourceEnabled { get; init; }
        public bool AlternateSourceConfigured { get; init; }
        public bool AlternateTrainingSourceConfigured { get; init; }
        public bool AlternateTrainingSourceEnabled { get; init; }
        public bool BuildIsPending { get; init; }
        public bool HasTranslationEngineForSmt { get; init; }
        public bool UseEchoForPreTranslation { get; init; }
        public bool LocalSourceTextHasData { get; init; }
        public bool LocalTargetTextHasData { get; init; }
        public bool AdditionalTrainingSourceConfigured { get; init; }
        public string? ServalConfig { get; init; }
    }

    private class TestEnvironment
    {
        public TestEnvironment(TestEnvironmentOptions? options = null)
        {
            options ??= new TestEnvironmentOptions();
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            MockLogger = new MockLogger<MachineProjectService>();
            DataFilesClient = Substitute.For<IDataFilesClient>();
            DataFilesClient
                .CreateAsync(Arg.Any<FileParameter>(), Arg.Any<FileFormat>(), Arg.Any<string>(), CancellationToken.None)
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
            TranslationEnginesClient
                .GetCorpusAsync(TranslationEngine01, Arg.Any<string>(), CancellationToken.None)
                .Returns(args =>
                    Task.FromResult(
                        new TranslationCorpus
                        {
                            Id = args.ArgAt<string>(1),
                            SourceLanguage = "en_US",
                            TargetLanguage = "en_GB",
                        }
                    )
                );
            TranslationEnginesClient
                .GetCorpusAsync(TranslationEngine02, Arg.Any<string>(), CancellationToken.None)
                .Returns(args =>
                    Task.FromResult(
                        new TranslationCorpus
                        {
                            Id = args.ArgAt<string>(1),
                            SourceLanguage = "en_GB",
                            TargetLanguage = "en_US",
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
                    .Returns(Task.FromResult(new TranslationBuild { Pretranslate = [new PretranslateCorpus()], }));
            }
            else
            {
                TranslationEnginesClient
                    .GetCurrentBuildAsync(Arg.Any<string>(), null, CancellationToken.None)
                    .ThrowsAsync(ServalApiExceptions.NoContent);
            }

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
                            TranslationEngineId = options.HasTranslationEngineForSmt ? TranslationEngine02 : null,
                            Corpora = new Dictionary<string, ServalCorpus>
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
                            },
                        },
                    },
                    new SFProjectSecret { Id = Project03 },
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
                            DraftConfig = new DraftConfig { ServalConfig = options.ServalConfig },
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
                                ProjectRef = Project03,
                                ParatextId = Paratext03,
                                WritingSystem = new WritingSystem { Tag = "en" },
                            },
                            DraftConfig = new DraftConfig
                            {
                                AlternateSourceEnabled = options.AlternateSourceEnabled,
                                AlternateSource = options.AlternateSourceConfigured
                                    ? new TranslateSource
                                    {
                                        ProjectRef = Project01,
                                        ParatextId = Paratext01,
                                        WritingSystem = new WritingSystem { Tag = "en_GB" },
                                    }
                                    : null,
                                AlternateTrainingSourceEnabled = options.AlternateTrainingSourceEnabled,
                                AlternateTrainingSource = options.AlternateTrainingSourceConfigured
                                    ? new TranslateSource
                                    {
                                        ProjectRef = Project01,
                                        ParatextId = Paratext01,
                                        WritingSystem = new WritingSystem { Tag = "en_GB" },
                                    }
                                    : null,
                                AdditionalTrainingSourceEnabled = options.AdditionalTrainingSourceConfigured,
                                AdditionalTrainingSource = options.AdditionalTrainingSourceConfigured
                                    ? new TranslateSource { ProjectRef = Project01, ParatextId = Paratext01 }
                                    : null,
                            },
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
                ]
            );

            TrainingDataService = Substitute.For<ITrainingDataService>();
            TrainingData = new MemoryRepository<TrainingData>();

            var realtimeService = new SFMemoryRealtimeService();
            realtimeService.AddRepository("sf_projects", OTType.Json0, Projects);
            realtimeService.AddRepository("training_data", OTType.Json0, TrainingData);

            Service = new MachineProjectService(
                DataFilesClient,
                ExceptionHandler,
                FeatureManager,
                FileSystemService,
                MockLogger,
                ParatextService,
                ProjectSecrets,
                realtimeService,
                siteOptions,
                TrainingDataService,
                TranslationEnginesClient,
                userSecrets
            );
        }

        public MachineProjectService Service { get; }
        public IDataFilesClient DataFilesClient { get; }
        public IFeatureManager FeatureManager { get; }
        public IFileSystemService FileSystemService { get; }
        public IParatextService ParatextService { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
        public ITrainingDataService TrainingDataService { get; }
        public MemoryRepository<TrainingData> TrainingData { get; }
        public MemoryRepository<SFProject> Projects { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public MockLogger<MachineProjectService> MockLogger { get; }
        public IExceptionHandler ExceptionHandler { get; }

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

        public async Task BeforeFirstSync(string projectId) =>
            await ProjectSecrets.UpdateAsync(
                projectId,
                u => u.Set(p => p.ServalData, new ServalData { TranslationEngineId = TranslationEngine01 })
            );

        /// <summary>
        /// Sets up the additional training data
        /// </summary>
        /// <param name="projectId">The project identifier.</param>
        /// <param name="existingData">If the project is to have existing data, <c>true</c>. Default: <c>false</c>.</param>
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
                    ((List<ISFText>)args[4]).Add(GetMockTrainingData(false));
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

        private static MockText GetMockTrainingData(bool source) =>
            new MockText
            {
                Id = Data01,
                Segments = new List<SFTextSegment>
                {
                    new SFTextSegment(["1"], $"alternate {(source ? "source" : "target")}", false, false, false),
                    new SFTextSegment(["2"], string.Empty, false, false, false),
                },
            };
    }
}
