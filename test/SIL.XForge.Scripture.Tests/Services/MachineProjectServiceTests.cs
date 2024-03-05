using System;
using System.Collections.Generic;
using System.IO;
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
using SIL.XForge.Utils;

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

        await env.TranslationEnginesClient.Received()
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

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotPassTrainOnIfAlternateTrainingSourceEnabledWithoutAlternateSource()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { BuildIsPending = false, AlternateTrainingSourceEnabled = true }
        );

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine01,
                Arg.Is<TranslationBuildConfig>(b => b.TrainOn == null),
                CancellationToken.None
            );
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
        await env.TrainingDataService.Received()
            .GetTextsAsync(
                User01,
                Project01,
                Arg.Is<IEnumerable<string>>(d => d.Contains(Data01)),
                Arg.Any<IList<ISFText>>(),
                Arg.Any<IList<ISFText>>()
            );

        // Ensure that the additional files corpus was synced, and the build started
        await env.TranslationEnginesClient.Received()
            .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        Assert.IsNotEmpty(
            env.ProjectSecrets.Get(Project01)
                .ServalData!.Corpora.First(c => c.Value.PreTranslate && c.Value.AdditionalTrainingData)
                .Key
        );
        await env.TranslationEnginesClient.Received()
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
        await env.TrainingDataService.Received()
            .GetTextsAsync(
                User01,
                Project02,
                Arg.Is<IEnumerable<string>>(d => d.Contains(Data01)),
                Arg.Any<IList<ISFText>>(),
                Arg.Any<IList<ISFText>>()
            );

        // Ensure that the previous files with different IDs were deleted, and new ones added
        await env.DataFilesClient.Received().DeleteAsync(File01);
        await env.DataFilesClient.Received().DeleteAsync(File02);
        await env.DataFilesClient.Received()
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
        await env.TrainingDataService.Received()
            .GetTextsAsync(
                User01,
                Project02,
                Arg.Is<IEnumerable<string>>(d => d.Contains(Data01)),
                Arg.Any<IList<ISFText>>(),
                Arg.Any<IList<ISFText>>()
            );

        // Ensure that the build passed the additional files corpus in the train_on parameter
        string corpusId = env.ProjectSecrets.Get(Project02)
            .ServalData!.Corpora.First(c => c.Value.PreTranslate && c.Value.AdditionalTrainingData)
            .Key;
        await env.TranslationEnginesClient.Received()
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

        await env.TranslationEnginesClient.Received()
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

        await env.TranslationEnginesClient.Received()
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

        await env.TranslationEnginesClient.Received()
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

        await env.TranslationEnginesClient.Received()
            .CreateAsync(
                Arg.Is<TranslationEngineConfig>(
                    t => t.SourceLanguage == sourceLanguage && t.TargetLanguage == targetLanguage
                ),
                CancellationToken.None
            );
    }

    [Test]
    public async Task BuildProjectAsync_CreatesServalProjectIfRemoved()
    {
        // Set up test environment
        var env = new TestEnvironment(new TestEnvironmentOptions());
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

        await env.TranslationEnginesClient.Received()
            .CreateAsync(
                Arg.Is<TranslationEngineConfig>(
                    t => t.SourceLanguage == sourceLanguage && t.TargetLanguage == targetLanguage
                ),
                CancellationToken.None
            );
    }

    [Test]
    public void BuildProjectAsync_DirectoryNotFound()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { BuildIsPending = false, UploadParatextZipForPreTranslation = true }
        );
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

        await env.TranslationEnginesClient.Received()
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

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);

        // Ensure no methods that update the corpus or files were called
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .UpdateCorpusAsync(
                TranslationEngine02,
                Corpus02,
                Arg.Any<TranslationCorpusUpdateConfig>(),
                CancellationToken.None
            );
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), Arg.Any<FileFormat>(), Arg.Any<string>(), CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs()
            .UpdateAsync(Arg.Any<string>(), Arg.Any<FileParameter>(), CancellationToken.None);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationJobId);
        Assert.IsNull(env.ProjectSecrets.Get(Project02).ServalData!.PreTranslationQueuedAt);
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

        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
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

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.Received()
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
            .Returns(
                args =>
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

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesDataFilesOnServalIfMissing_Paratext()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                UploadParatextZipForPreTranslation = true,
            }
        );
        await env.SetDataInSync(Project02, preTranslate: true, requiresUpdate: true, uploadParatextZipFile: true);

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

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.DataFilesClient.Received()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Paratext, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesDataFilesOnServalIfMissing_SendAllSegments_RequiresTextFiles()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                SendAllSegments = true,
                UploadParatextZipForPreTranslation = true,
            }
        );
        await env.SetDataInSync(Project02, preTranslate: true, requiresUpdate: true, uploadParatextZipFile: true);

        // Make the Serval API return the error code for a missing data file
        env.DataFilesClient.GetAsync(Arg.Any<string>(), CancellationToken.None).Throws(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.DataFilesClient.Received()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesDataFilesOnServalIfMissing_Text()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(Project02, preTranslate: true, requiresUpdate: true);

        // Make the Serval API return the error code for a missing data file
        env.DataFilesClient.GetAsync(Arg.Any<string>(), CancellationToken.None).Throws(ServalApiExceptions.NotFound);

        // SUT
        await env.Service.BuildProjectAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.DataFilesClient.Received()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
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

        await env.TranslationEnginesClient.Received()
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

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(TranslationEngine01, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.Received().DeleteAsync(TranslationEngine02, CancellationToken.None);
        await env.TranslationEnginesClient.Received()
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
            requiresUpdate: false,
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
        await env.TranslationEnginesClient.Received()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.Received()
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
            requiresUpdate: false,
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
        await env.TranslationEnginesClient.Received()
            .DeleteCorpusAsync(TranslationEngine02, Corpus02, CancellationToken.None);
        await env.DataFilesClient.Received().DeleteAsync(File01, CancellationToken.None);

        // Ensure we have just one pre-translate corpora
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));
    }

    [Test]
    public async Task BuildProjectAsync_UploadParatextZipSpecifiesBookIds()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions { BuildIsPending = false, UploadParatextZipForPreTranslation = true }
        );
        await env.SetDataInSync(Project01, preTranslate: true, requiresUpdate: false, uploadParatextZipFile: true);

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

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine01,
                Arg.Is<TranslationBuildConfig>(
                    b =>
                        b.TrainOn.Count == 1
                        && b.TrainOn.First().TextIds.SequenceEqual(new[] { "GEN", "EXO" })
                        && b.TrainOn.First().CorpusId == Corpus01
                        && b.Pretranslate.Count == 1
                        && b.Pretranslate.First().CorpusId == Corpus01
                        && b.Pretranslate.First().TextIds.SequenceEqual(new[] { "LEV", "NUM" })
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
                UploadParatextZipForPreTranslation = true,
                AlternateTrainingSourceConfigured = true,
                AlternateTrainingSourceEnabled = true,
            }
        );
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            requiresUpdate: false,
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

        await env.TranslationEnginesClient.Received()
            .StartBuildAsync(
                TranslationEngine02,
                Arg.Is<TranslationBuildConfig>(
                    b =>
                        b.TrainOn.Count == 1
                        && b.TrainOn.First().TextIds.SequenceEqual(new[] { "GEN", "EXO" })
                        && b.TrainOn.First().CorpusId == Corpus02
                        && b.Pretranslate.Count == 1
                        && b.Pretranslate.First().CorpusId == Corpus01
                        && b.Pretranslate.First().TextIds.SequenceEqual(new[] { "LEV", "NUM" })
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

        await env.TranslationEnginesClient.Received()
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

        await env.TranslationEnginesClient.Received(1)
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
        await env.TranslationEnginesClient.Received(1)
            .DeleteCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None);
        await env.DataFilesClient.Received(1).DeleteAsync(File01, CancellationToken.None);
        await env.DataFilesClient.Received(1).DeleteAsync(File02, CancellationToken.None);
    }

    [Test]
    public async Task RemoveProjectAsync_DoesNotCallServalIfNoTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);

        // Ensure that the translation engine, corpus and any files were not deleted
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteAsync(TranslationEngine01, CancellationToken.None);
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(TranslationEngine01, Corpus01, CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(File01, CancellationToken.None);
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
        await env.TranslationEnginesClient.Received(1)
            .AddCorpusAsync(
                Arg.Any<string>(),
                Arg.Is<TranslationCorpusConfig>(
                    t => t.SourceLanguage == sourceLanguage && t.TargetLanguage == targetLanguage
                ),
                CancellationToken.None
            );
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient.Received(1)
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
        await env.TranslationEnginesClient.Received(1)
            .AddCorpusAsync(
                Arg.Any<string>(),
                Arg.Is<TranslationCorpusConfig>(
                    t => t.SourceLanguage == sourceLanguage && t.TargetLanguage == sourceLanguage
                ),
                CancellationToken.None
            );
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient.Received(1)
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
        await env.DataFilesClient.ReceivedWithAnyArgs(1)
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
        await env.DataFilesClient.DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
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
        await env.DataFilesClient.DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs()
            .UpdateAsync(Arg.Any<string>(), Arg.Any<FileParameter>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotUpdateAlternateTrainingSourceOnSmtBuilds()
    {
        // Set up test environment
        var env = new TestEnvironment(
            new TestEnvironmentOptions
            {
                LocalSourceTextHasData = true,
                LocalTargetTextHasData = true,
                AlternateTrainingSourceConfigured = true,
                AlternateTrainingSourceEnabled = true,
            }
        );
        await env.SetDataInSync(
            Project02,
            preTranslate: true,
            requiresUpdate: false,
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
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), CancellationToken.None);
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
        await env.TextCorpusFactory.Received(1)
            .CreateAsync(
                Arg.Is<string[]>(p => p.Length == 1 && p.First() == Project02),
                TextCorpusType.Target,
                preTranslate: true,
                useAlternateTrainingSource: false,
                Arg.Is<BuildConfig>(
                    b => b.TrainingBooks.Count == 2 && b.TrainingBooks.First() == 1 && b.TrainingBooks.Last() == 2
                )
            );
        await env.TextCorpusFactory.Received(1)
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
                        SourceFiles =
                        [
                            new ServalCorpusFile
                            {
                                FileChecksum = "a_previous_checksum",
                                FileId = "File03",
                                TextId = "textId",
                            },
                        ],
                        TargetFiles = [],
                    }
                )
        );

        // Make the Serval API return a data file
        env.DataFilesClient.GetAsync(Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new DataFile()));

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: false,
            CancellationToken.None
        );
        Assert.IsTrue(actual);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient.ReceivedWithAnyArgs(1)
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
        await env.DataFilesClient.Received(2)
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
            requiresUpdate: false,
            uploadParatextZipFile: false,
            alternateTrainingSource: true
        );
        ServalApiException ex = ServalApiExceptions.NotFound;
        env.TranslationEnginesClient.DeleteCorpusAsync(TranslationEngine02, Corpus02, CancellationToken.None)
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
        Assert.IsFalse(actual);

        // The old corpus and its files should be deleted
        await env.TranslationEnginesClient.Received()
            .DeleteCorpusAsync(TranslationEngine02, Corpus02, CancellationToken.None);
        await env.DataFilesClient.Received().DeleteAsync(File01, CancellationToken.None);

        // Ensure we have just one pre-translate corpora
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));

        // The 404 exception was logged
        env.MockLogger.AssertHasEvent(
            logEvent => logEvent.LogLevel == LogLevel.Information && logEvent.Exception is ServalApiException
        );
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotCrashWhenDeletingMissingAlternateTrainingSourceFiles()
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
            requiresUpdate: false,
            uploadParatextZipFile: false,
            alternateTrainingSource: true
        );
        ServalApiException ex = ServalApiExceptions.NotFound;
        env.DataFilesClient.DeleteAsync(File01, CancellationToken.None).Throws(ex);

        // Check that we have more than one pre-translate corpora
        Assert.AreEqual(2, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(
            User01,
            new BuildConfig { ProjectId = Project02 },
            preTranslate: true,
            CancellationToken.None
        );
        Assert.IsFalse(actual);

        // The old corpus and its files should be deleted
        await env.TranslationEnginesClient.Received()
            .DeleteCorpusAsync(TranslationEngine02, Corpus02, CancellationToken.None);
        await env.DataFilesClient.Received().DeleteAsync(File01, CancellationToken.None);

        // Ensure we have just one pre-translate corpora
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData!.Corpora.Count(c => c.Value.PreTranslate));

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
                AlternateTrainingSourceConfigured = true,
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
        await env.TextCorpusFactory.Received(1)
            .CreateAsync(
                Arg.Any<IEnumerable<string>>(),
                TextCorpusType.Source,
                preTranslate: true,
                useAlternateTrainingSource: false,
                Arg.Any<BuildConfig>()
            );

        // Check for the generation of the alternate training source
        await env.TextCorpusFactory.Received(1)
            .CreateAsync(
                Arg.Any<IEnumerable<string>>(),
                TextCorpusType.Source,
                preTranslate: true,
                useAlternateTrainingSource: true,
                Arg.Any<BuildConfig>()
            );

        // The target is shared between the two corpora, so it will only be generated once
        await env.TextCorpusFactory.Received(1)
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
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
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
        await env.TranslationEnginesClient.Received(1)
            .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
            .DeleteCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), CancellationToken.None);
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
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
            new TestEnvironmentOptions { LocalSourceTextHasData = true, LocalTargetTextHasData = true }
        );
        await env.SetDataInSync(Project02);

        // Make the Serval API return the corpus
        env.TranslationEnginesClient.GetCorpusAsync(TranslationEngine02, Arg.Any<string>(), CancellationToken.None)
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
        await env.TranslationEnginesClient.Received(1)
            .AddCorpusAsync(Arg.Any<string>(), Arg.Any<TranslationCorpusConfig>(), CancellationToken.None);
        await env.TranslationEnginesClient.Received(1)
            .DeleteCorpusAsync(Arg.Any<string>(), Arg.Any<string>(), CancellationToken.None);
        await env.TranslationEnginesClient.DidNotReceiveWithAnyArgs()
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
                    new DraftConfig { AlternateSource = new TranslateSource { ParatextId = Paratext01 } }
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

    private class TestEnvironmentOptions
    {
        public bool BuildIsPending { get; init; }
        public bool PreTranslationBuildIsQueued { get; init; }
        public bool UseEchoForPreTranslation { get; init; }
        public bool LocalSourceTextHasData { get; init; }
        public bool LocalTargetTextHasData { get; init; }
        public bool AlternateTrainingSourceConfigured { get; init; }
        public bool AlternateTrainingSourceEnabled { get; init; }
        public bool SendAllSegments { get; init; }
        public string? ServalConfig { get; init; }
        public bool UploadParatextZipForPreTranslation { get; init; }
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
                .Returns(
                    args =>
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
                .Returns(
                    args =>
                        Task.FromResult(
                            new TranslationCorpus
                            {
                                Id = args.ArgAt<string>(1),
                                SourceLanguage = "en",
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

            ParatextService = Substitute.For<IParatextService>();
            ParatextService.GetLanguageId(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns("en");
            ParatextService
                .GetParatextSettings(Arg.Any<UserSecret>(), Arg.Any<string>())
                .Returns(new ParatextSettings { IsRightToLeft = true, LanguageTag = LanguageTag });
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
            featureManager
                .IsEnabledAsync(FeatureFlags.UploadParatextZipForPreTranslation)
                .Returns(Task.FromResult(options.UploadParatextZipForPreTranslation));

            FileSystemService = Substitute.For<IFileSystemService>();
            FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(true);
            FileSystemService
                .EnumerateFiles(Arg.Any<string>())
                .Returns(callInfo => new[] { Path.Combine(callInfo.ArgAt<string>(0), "file") });
            FileSystemService
                .OpenFile(Arg.Any<string>(), FileMode.Open)
                .Returns(
                    callInfo =>
                        new MemoryStream(
                            Encoding.UTF8.GetBytes(Path.Combine(callInfo.ArgAt<string>(0) + "_file_contents"))
                        )
                );

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
                                        SourceFiles = [new ServalCorpusFile { FileId = File01 }],
                                        TargetFiles = [new ServalCorpusFile { FileId = File02 }],
                                    }
                                },
                                {
                                    Corpus02,
                                    new ServalCorpus
                                    {
                                        PreTranslate = true,
                                        AlternateTrainingSource = false,
                                        SourceFiles = [new ServalCorpusFile { FileId = File01 }],
                                        TargetFiles = [new ServalCorpusFile { FileId = File02 }],
                                    }
                                },
                            },
                        },
                    },
                    new SFProjectSecret { Id = Project03 },
                }
            );

            var siteOptions = Substitute.For<IOptions<SiteOptions>>();
            siteOptions.Value.Returns(new SiteOptions { SiteDir = "xForge" });
            var userSecrets = new MemoryRepository<UserSecret>(new[] { new UserSecret { Id = User01 } });

            Projects = new MemoryRepository<SFProject>(
                new[]
                {
                    new SFProject
                    {
                        Id = Project01,
                        Name = "project01",
                        ShortName = "P01",
                        ParatextId = Paratext01,
                        CheckingConfig = new CheckingConfig { ShareEnabled = false },
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
                            DraftConfig = new DraftConfig
                            {
                                SendAllSegments = options.SendAllSegments,
                                ServalConfig = options.ServalConfig,
                            },
                        },
                        WritingSystem = new WritingSystem { Tag = "en_GB" },
                    },
                    new SFProject
                    {
                        Id = Project02,
                        Name = "project02",
                        ShortName = "P02",
                        ParatextId = Paratext02,
                        CheckingConfig = new CheckingConfig { ShareEnabled = false },
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
                                AlternateTrainingSourceEnabled = options.AlternateTrainingSourceEnabled,
                                AlternateTrainingSource = options.AlternateTrainingSourceConfigured
                                    ? new TranslateSource { ProjectRef = Project01, ParatextId = Paratext01 }
                                    : null,
                                SendAllSegments = options.SendAllSegments,
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
                        UserRoles = [],
                        TranslateConfig = new TranslateConfig
                        {
                            TranslationSuggestionsEnabled = true,
                            Source = new TranslateSource { ProjectRef = Project01 },
                        },
                    },
                }
            );

            TrainingDataService = Substitute.For<ITrainingDataService>();
            TrainingData = new MemoryRepository<TrainingData>();

            var realtimeService = new SFMemoryRealtimeService();
            realtimeService.AddRepository("sf_projects", OTType.Json0, Projects);
            realtimeService.AddRepository("training_data", OTType.Json0, TrainingData);

            Service = new MachineProjectService(
                DataFilesClient,
                ExceptionHandler,
                featureManager,
                FileSystemService,
                MockLogger,
                ParatextService,
                ProjectSecrets,
                realtimeService,
                siteOptions,
                TextCorpusFactory,
                TrainingDataService,
                TranslationEnginesClient,
                userSecrets
            );
        }

        private static string MockTextCorpusWithoutEmptySegmentChecksum =>
            StringUtils.ComputeMd5Hash("segRef\tsegment01\n");

        private static string MockTextCorpusWithEmptySegmentChecksum =>
            StringUtils.ComputeMd5Hash("segRef\tsegment01\nsegRef_2\t\n");

        private static Task<IEnumerable<ISFText>> MockTextCorpus =>
            Task.FromResult<IEnumerable<ISFText>>(
                new[]
                {
                    new MockText
                    {
                        Id = "textId",
                        Segments = new List<SFTextSegment>
                        {
                            new SFTextSegment(["segRef"], "segment01", false, false, false),
                            new SFTextSegment(["segRef_2"], string.Empty, false, false, false),
                        },
                    },
                }
            );

        public MachineProjectService Service { get; }
        public IDataFilesClient DataFilesClient { get; }
        public IFileSystemService FileSystemService { get; }
        public IParatextService ParatextService { get; }
        public ISFTextCorpusFactory TextCorpusFactory { get; }
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
            bool requiresUpdate = false,
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
                                    FileChecksum = requiresUpdate
                                        ? "old_checksum"
                                        : MockTextCorpusWithEmptySegmentChecksum,
                                    FileId = File01,
                                    TextId = "textId",
                                },
                            ],
                            TargetFiles =
                            [
                                new ServalCorpusFile
                                {
                                    FileChecksum = requiresUpdate switch
                                    {
                                        true => "old_checksum",
                                        false when preTranslate => MockTextCorpusWithEmptySegmentChecksum,
                                        false => MockTextCorpusWithoutEmptySegmentChecksum,
                                    },
                                    FileId = File02,
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
                                        FileChecksum = requiresUpdate
                                            ? "old_checksum"
                                            : MockTextCorpusWithEmptySegmentChecksum,
                                        FileId = File01,
                                        TextId = "textId",
                                    },
                                ],
                                TargetFiles =
                                [
                                    new ServalCorpusFile
                                    {
                                        FileChecksum = requiresUpdate switch
                                        {
                                            true => "old_checksum",
                                            false when preTranslate => MockTextCorpusWithEmptySegmentChecksum,
                                            false => MockTextCorpusWithoutEmptySegmentChecksum,
                                        },
                                        FileId = File02,
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
                    ((List<ISFText>)args[3]).Add(GetMockTrainingData(TextCorpusType.Source));
                    ((List<ISFText>)args[4]).Add(GetMockTrainingData(TextCorpusType.Target));
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
                                SourceFiles = new List<ServalCorpusFile> { new ServalCorpusFile { FileId = File01 }, },
                                TargetFiles = new List<ServalCorpusFile> { new ServalCorpusFile { FileId = File02 }, },
                            }
                        );
                    }
                );
            }
        }

        private static ISFText GetMockTrainingData(TextCorpusType textCorpusType) =>
            new MockText
            {
                Id = Data01,
                Segments = new List<SFTextSegment>
                {
                    new SFTextSegment(
                        ["1"],
                        $"alternate {textCorpusType.ToString().ToLowerInvariant()}",
                        false,
                        false,
                        false
                    ),
                    new SFTextSegment(["2"], string.Empty, false, false, false),
                },
            };
    }
}
