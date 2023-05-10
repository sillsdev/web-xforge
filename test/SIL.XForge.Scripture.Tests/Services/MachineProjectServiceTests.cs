using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
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
    private const string File01 = "file01";
    private const string File02 = "file02";
    private const string TranslationEngine01 = "translationEngine01";
    private const string TranslationEngine02 = "translationEngine02";

    [Test]
    public async Task AddProjectAsync_ExecutesInProcessMachineAndServal()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationEngine { Id = TranslationEngine01 }));

        // SUT
        await env.Service.AddProjectAsync(User01, Project01, CancellationToken.None);

        await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
        Assert.AreEqual(TranslationEngine01, env.ProjectSecrets.Get(Project01).ServalData?.TranslationEngineId);
    }

    [Test]
    public async Task AddProjectAsync_DoesNotCallServalIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        await env.Service.AddProjectAsync(User01, Project01, CancellationToken.None);

        await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task AddProjectAsync_DoesNotExecuteInProcessMachineIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));
        env.TranslationEnginesClient
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationEngine { Id = TranslationEngine01 }));

        // SUT
        await env.Service.AddProjectAsync(User01, Project01, CancellationToken.None);

        await env.EngineService.DidNotReceiveWithAnyArgs().AddProjectAsync(Arg.Any<MachineProject>());
    }

    [Test]
    public async Task BuildProjectAsync_CallsServalIfTranslationEngineIdPresent()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TextCorpusFactory
            .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
            .Returns(TestEnvironment.MockTextCorpus);
        env.TranslationEnginesClient
            .GetCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None)
            .Returns(Task.FromResult(new TranslationCorpus { Id = Corpus01 }));
        env.TranslationEnginesClient
            .AddCorpusAsync(TranslationEngine02, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationCorpus { Id = Corpus02 }));
        env.DataFilesClient
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new DataFile { Id = File01 }));

        // SUT
        await env.Service.BuildProjectAsync(User01, Project02, CancellationToken.None);

        await env.TranslationEnginesClient
            .Received()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotCallServalIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        await env.Service.BuildProjectAsync(User01, Project02, CancellationToken.None);

        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .GetCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotExecuteInProcessMachineIfFeatureDisabled()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        await env.Service.BuildProjectAsync(User01, Project02, CancellationToken.None);

        await env.EngineService.DidNotReceive().StartBuildByProjectIdAsync(Project02);
    }

    [Test]
    public async Task BuildProjectAsync_DoesNotBuildServalIfNoTextChanges()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.BuildProjectAsync(User01, Project02, CancellationToken.None);

        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_CreatesTranslationEngineIfNoTranslationEngineId()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TranslationEnginesClient
            .CreateAsync(Arg.Any<TranslationEngineConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationEngine { Id = TranslationEngine01 }));

        // SUT
        await env.Service.BuildProjectAsync(User01, Project01, CancellationToken.None);

        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .StartBuildAsync(TranslationEngine02, Arg.Any<TranslationBuildConfig>(), CancellationToken.None);
    }

    [Test]
    public async Task BuildProjectAsync_ExecutesInProcessMachine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.BuildProjectAsync(User01, Project02, CancellationToken.None);

        await env.EngineService.Received().StartBuildByProjectIdAsync(Project02);
    }

    [Test]
    public async Task RemoveProjectAsync_CallsServalIfTranslationEngineIdPresent()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project02, CancellationToken.None);

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
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project02, CancellationToken.None);

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
        await env.Service.RemoveProjectAsync(User01, Project01, CancellationToken.None);

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
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(false));

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project02, CancellationToken.None);

        // Ensure that the in process instance was not called
        await env.EngineService.DidNotReceiveWithAnyArgs().RemoveProjectAsync(Project02);
    }

    [Test]
    public async Task RemoveProjectAsync_ExecutesInProcessMachine()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        await env.Service.RemoveProjectAsync(User01, Project01, CancellationToken.None);

        await env.EngineService.Received().RemoveProjectAsync(Project01);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_CreatesCorpusIfMissing()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TextCorpusFactory
            .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
            .Returns(TestEnvironment.MockTextCorpus);
        env.TranslationEnginesClient
            .AddCorpusAsync(TranslationEngine01, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationCorpus { Id = Corpus01 }));
        env.DataFilesClient
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new DataFile { Id = File01 }));
        await env.ProjectSecrets.UpdateAsync(
            Project01,
            u => u.Set(p => p.ServalData, new ServalData { TranslationEngineId = TranslationEngine01 })
        );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project01, CancellationToken.None);
        Assert.IsTrue(actual);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .ReceivedWithAnyArgs(1)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, string.Empty, CancellationToken.None);
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project01).ServalData?.Corpora[Corpus01].SourceFiles.Count);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_CreatesCorpusTextIfTextDoesNotExistInProjectSecretOrServal()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TextCorpusFactory
            .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
            .Returns(TestEnvironment.MockTextCorpus);
        env.TranslationEnginesClient
            .GetCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationCorpus
                    {
                        Id = Corpus01,
                        SourceFiles = new[]
                        {
                            new TranslationCorpusFile
                            {
                                File = new ResourceLink { Id = "File03", Url = "/corpora/corpus01/files/File03" },
                                TextId = "textId",
                            },
                        },
                        TargetFiles = new[]
                        {
                            new TranslationCorpusFile
                            {
                                File = new ResourceLink { Id = "File04", Url = "/corpora/corpus01/files/File04" },
                                TextId = "textId",
                            },
                        },
                    }
                )
            );
        env.TranslationEnginesClient
            .AddCorpusAsync(TranslationEngine02, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationCorpus { Id = Corpus02 }));
        env.DataFilesClient
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new DataFile { Id = File01 }));

        // SUT
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData?.Corpora[Corpus01].TargetFiles.Count);
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData?.Corpora[Corpus01].SourceFiles.Count);
        bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
        Assert.IsTrue(actual);
        await env.DataFilesClient.ReceivedWithAnyArgs(2).DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .ReceivedWithAnyArgs(1)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, string.Empty, CancellationToken.None);
        Assert.AreEqual(1, env.ProjectSecrets.Get(Project02).ServalData?.Corpora[Corpus02].SourceFiles.Count);
        Assert.AreEqual(0, env.ProjectSecrets.Get(Project02).ServalData?.Corpora[Corpus02].TargetFiles.Count);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_CreatesCorpusTextIfTextExistsInProjectServerButNotServal()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TextCorpusFactory
            .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
            .Returns(TestEnvironment.MockTextCorpus);
        env.TranslationEnginesClient
            .GetCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None)
            .Returns(Task.FromResult(new TranslationCorpus()));
        env.TranslationEnginesClient
            .AddCorpusAsync(TranslationEngine02, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationCorpus { Id = Corpus02 }));
        env.DataFilesClient
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new DataFile { Id = "File03" }));
        await env.ProjectSecrets.UpdateAsync(
            Project02,
            u =>
                u.Add(
                    p => p.ServalData.Corpora[Corpus01].SourceFiles,
                    new ServalCorpusFile
                    {
                        FileChecksum = "a_previous_checksum",
                        FileId = "File03",
                        TextId = "textId",
                    }
                )
        );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
        Assert.IsTrue(actual);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .ReceivedWithAnyArgs(1)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotUpdateIfNoChanges()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TextCorpusFactory
            .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
            .Returns(TestEnvironment.MockTextCorpus);
        string checksum = StringUtils.ComputeMd5Hash("segRef\tsegment01\n");
        await env.ProjectSecrets.UpdateAsync(
            Project02,
            u =>
                u.Add(
                    p => p.ServalData.Corpora[Corpus01].SourceFiles,
                    new ServalCorpusFile
                    {
                        FileChecksum = checksum,
                        FileId = "File03",
                        TextId = "textId",
                    }
                )
        );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
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
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(false));

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
        Assert.IsFalse(actual);
        await env.TranslationEnginesClient
            .DidNotReceiveWithAnyArgs()
            .GetCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_DoesNotUpdateIfNoText()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
        Assert.IsFalse(actual);
        await env.DataFilesClient.DidNotReceiveWithAnyArgs().DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .DidNotReceiveWithAnyArgs()
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_FailsIfCorpusNotAddedToTranslationEngine()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TextCorpusFactory
            .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
            .Returns(TestEnvironment.MockTextCorpus);
        env.TranslationEnginesClient
            .AddCorpusAsync(TranslationEngine01, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
            .Throws(new BrokenCircuitException());
        env.DataFilesClient
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new DataFile { Id = File01 }));
        await env.ProjectSecrets.UpdateAsync(
            Project01,
            u => u.Set(p => p.ServalData, new ServalData { TranslationEngineId = TranslationEngine01 })
        );

        // SUT
        Assert.ThrowsAsync<BrokenCircuitException>(
            () => env.Service.SyncProjectCorporaAsync(User01, Project01, CancellationToken.None)
        );
    }

    [Test]
    public async Task SyncProjectCorporaAsync_UpdatesCorpusIfTextExists()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TextCorpusFactory
            .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
            .Returns(TestEnvironment.MockTextCorpus);
        env.TranslationEnginesClient
            .GetCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationCorpus
                    {
                        SourceFiles = new[]
                        {
                            new TranslationCorpusFile
                            {
                                File = new ResourceLink { Id = "File03", Url = "/corpora/corpus01/files/File03" },
                                TextId = "textId",
                            },
                        },
                    }
                )
            );
        env.TranslationEnginesClient
            .AddCorpusAsync(TranslationEngine02, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationCorpus { Id = Corpus02 }));
        env.DataFilesClient
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new DataFile { Id = "File04" }));
        await env.ProjectSecrets.UpdateAsync(
            Project02,
            u =>
                u.Add(
                    p => p.ServalData.Corpora[Corpus01].SourceFiles,
                    new ServalCorpusFile
                    {
                        FileChecksum = "a_previous_checksum",
                        FileId = "File03",
                        TextId = "textId",
                    }
                )
        );

        // SUT
        bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
        Assert.IsTrue(actual);
        await env.DataFilesClient.ReceivedWithAnyArgs(1).DeleteAsync(string.Empty, CancellationToken.None);
        await env.DataFilesClient
            .ReceivedWithAnyArgs(1)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, Arg.Any<string>(), CancellationToken.None);
    }

    [Test]
    public async Task SyncProjectCorporaAsync_UpdatesSourceAndTargetTexts()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.TextCorpusFactory
            .CreateAsync(Arg.Any<IEnumerable<string>>(), Arg.Any<TextCorpusType>())
            .Returns(TestEnvironment.MockTextCorpus);
        env.TranslationEnginesClient
            .GetCorpusAsync(TranslationEngine02, Corpus01, CancellationToken.None)
            .Returns(
                Task.FromResult(
                    new TranslationCorpus
                    {
                        SourceFiles = new[]
                        {
                            new TranslationCorpusFile
                            {
                                File = new ResourceLink { Id = "File03", Url = "/corpora/corpus01/files/File03" },
                                TextId = "textId",
                            },
                        },
                        TargetFiles = new[]
                        {
                            new TranslationCorpusFile
                            {
                                File = new ResourceLink { Id = "File04", Url = "/corpora/corpus01/files/File04" },
                                TextId = "textId",
                            },
                        },
                    }
                )
            );
        env.TranslationEnginesClient
            .AddCorpusAsync(TranslationEngine02, Arg.Any<TranslationCorpusConfig>(), CancellationToken.None)
            .Returns(Task.FromResult(new TranslationCorpus { Id = Corpus02 }));
        env.DataFilesClient
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, "textId", CancellationToken.None)
            .Returns(Task.FromResult(new DataFile { Id = "File05" }));
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
        bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
        Assert.IsTrue(actual);
        await env.DataFilesClient.Received(1).DeleteAsync("File03", CancellationToken.None);
        await env.DataFilesClient.Received(1).DeleteAsync("File04", CancellationToken.None);
        await env.DataFilesClient
            .Received(2)
            .CreateAsync(Arg.Any<FileParameter>(), FileFormat.Text, "textId", CancellationToken.None);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            EngineService = Substitute.For<IEngineService>();
            var logger = new MockLogger<MachineProjectService>();
            DataFilesClient = Substitute.For<IDataFilesClient>();
            TranslationEnginesClient = Substitute.For<ITranslationEnginesClient>();
            var paratextService = Substitute.For<IParatextService>();
            TextCorpusFactory = Substitute.For<ITextCorpusFactory>();

            FeatureManager = Substitute.For<IFeatureManager>();
            FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(true));
            FeatureManager.IsEnabledAsync(FeatureFlags.MachineInProcess).Returns(Task.FromResult(true));

            ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                new[]
                {
                    new SFProjectSecret { Id = Project01 },
                    new SFProjectSecret
                    {
                        Id = Project02,
                        ServalData = new ServalData
                        {
                            TranslationEngineId = TranslationEngine02,
                            Corpora = new Dictionary<string, ServalCorpus>
                            {
                                {
                                    Corpus01,
                                    new ServalCorpus
                                    {
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
                    },
                }
            );

            var realtimeService = new SFMemoryRealtimeService();
            realtimeService.AddRepository("sf_projects", OTType.Json0, Projects);

            Service = new MachineProjectService(
                DataFilesClient,
                EngineService,
                FeatureManager,
                logger,
                paratextService,
                ProjectSecrets,
                realtimeService,
                TextCorpusFactory,
                TranslationEnginesClient,
                userSecrets
            );
        }

        public static Task<ITextCorpus> MockTextCorpus =>
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
        public IFeatureManager FeatureManager { get; }
        public IDataFilesClient DataFilesClient { get; }
        public ITranslationEnginesClient TranslationEnginesClient { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public MemoryRepository<SFProject> Projects { get; }
        public ITextCorpusFactory TextCorpusFactory { get; }
    }
}
