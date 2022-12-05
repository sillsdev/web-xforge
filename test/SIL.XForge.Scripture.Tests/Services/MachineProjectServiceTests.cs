using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.FeatureManagement;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.Corpora;
using SIL.Machine.WebApi.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Utils;
using MachineProject = SIL.Machine.WebApi.Models.Project;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class MachineProjectServiceTests
    {
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string Project03 = "project03";
        private const string User01 = "user01";
        private const string Corpus01 = "corpus01";
        private const string File01 = "file01";
        private const string File02 = "file02";
        private const string TranslationEngine01 = "translationEngine01";
        private const string TranslationEngine02 = "translationEngine02";

        [Test]
        public async Task AddProjectAsync_ExecutesInProcessMachineAndMachineApi()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.MachineTranslationService
                .CreateTranslationEngineAsync(
                    Project01,
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<CancellationToken>()
                )
                .Returns(Task.FromResult(TranslationEngine01));

            // SUT
            await env.Service.AddProjectAsync(User01, Project01, CancellationToken.None);

            await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
            Assert.AreEqual(TranslationEngine01, env.ProjectSecrets.Get(Project01).MachineData?.TranslationEngineId);
        }

        [Test]
        public async Task AddProjectAsync_DoesNotCallMachineApiIfFeatureDisabled()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // SUT
            await env.Service.AddProjectAsync(User01, Project01, CancellationToken.None);

            await env.EngineService.Received().AddProjectAsync(Arg.Any<MachineProject>());
            await env.MachineTranslationService
                .DidNotReceiveWithAnyArgs()
                .CreateTranslationEngineAsync(
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<CancellationToken>()
                );
        }

        [Test]
        public async Task BuildProjectAsync_CallsMachineApiIfTranslationEngineIdPresent()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.TextCorpusFactory
                .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
                .Returns(
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
                    )
                );

            // SUT
            await env.Service.BuildProjectAsync(User01, Project02, CancellationToken.None);

            await env.MachineBuildService.Received().StartBuildAsync(TranslationEngine02, CancellationToken.None);
        }

        [Test]
        public async Task BuildProjectAsync_DoesNotCallMachineApiIfFeatureDisabled()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // SUT
            await env.Service.BuildProjectAsync(User01, Project02, CancellationToken.None);

            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .GetCorpusFilesAsync(Corpus01, CancellationToken.None);
            await env.MachineBuildService
                .DidNotReceiveWithAnyArgs()
                .StartBuildAsync(TranslationEngine02, CancellationToken.None);
        }

        [Test]
        public async Task BuildProjectAsync_DoesNotBuildMachineApiIfNoTextChanges()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.BuildProjectAsync(User01, Project02, CancellationToken.None);

            await env.MachineBuildService
                .DidNotReceiveWithAnyArgs()
                .StartBuildAsync(TranslationEngine02, CancellationToken.None);
        }

        [Test]
        public async Task BuildProjectAsync_DoesNotBuildMachineApiIfNoTranslationEngineId()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.BuildProjectAsync(User01, Project01, CancellationToken.None);

            await env.MachineBuildService
                .DidNotReceiveWithAnyArgs()
                .StartBuildAsync(TranslationEngine02, CancellationToken.None);
        }

        [Test]
        public async Task BuildProjectAsync_ExecutesInProcessMachine()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.BuildProjectAsync(User01, Project01, CancellationToken.None);

            await env.EngineService.Received().StartBuildByProjectIdAsync(Project01);
        }

        [Test]
        public async Task RemoveProjectAsync_CallsMachineApiIfTranslationEngineIdPresent()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.RemoveProjectAsync(User01, Project02, CancellationToken.None);

            // Ensure that the translation engine, corpus and any files are deleted
            await env.MachineTranslationService
                .Received(1)
                .DeleteTranslationEngineAsync(TranslationEngine02, CancellationToken.None);
            await env.MachineCorporaService.Received(1).DeleteCorpusAsync(Corpus01, CancellationToken.None);
            await env.MachineCorporaService.Received(1).DeleteCorpusFileAsync(Corpus01, File01, CancellationToken.None);
            await env.MachineCorporaService.Received(1).DeleteCorpusFileAsync(Corpus01, File02, CancellationToken.None);
        }

        [Test]
        public async Task RemoveProjectAsync_DoesNotCallMachineApiIfFeatureDisabled()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // SUT
            await env.Service.RemoveProjectAsync(User01, Project02, CancellationToken.None);

            // Ensure that the translation engine, corpus and any files were not deleted
            await env.MachineTranslationService
                .DidNotReceiveWithAnyArgs()
                .DeleteTranslationEngineAsync(TranslationEngine02, CancellationToken.None);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusAsync(Corpus01, CancellationToken.None);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(Corpus01, File01, CancellationToken.None);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(Corpus01, File02, CancellationToken.None);
        }

        [Test]
        public async Task RemoveProjectAsync_DoesNotCallMachineApiIfNoTranslationEngineId()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            await env.Service.RemoveProjectAsync(User01, Project01, CancellationToken.None);

            // Ensure that the translation engine, corpus and any files were not deleted
            await env.MachineTranslationService
                .DidNotReceiveWithAnyArgs()
                .DeleteTranslationEngineAsync(TranslationEngine01, CancellationToken.None);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusAsync(Corpus01, CancellationToken.None);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(Corpus01, File01, CancellationToken.None);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(Corpus01, File02, CancellationToken.None);
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
                .Returns(
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
                    )
                );
            env.MachineCorporaService
                .CreateCorpusAsync(Arg.Any<string>(), false, CancellationToken.None)
                .Returns(Task.FromResult(Corpus01));
            await env.ProjectSecrets.UpdateAsync(
                Project01,
                u => u.Set(p => p.MachineData, new MachineData { TranslationEngineId = Project01 })
            );

            // SUT
            bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project01, CancellationToken.None);
            Assert.IsTrue(actual);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(string.Empty, string.Empty, default);
            await env.MachineCorporaService
                .ReceivedWithAnyArgs(1)
                .UploadCorpusTextAsync(string.Empty, string.Empty, string.Empty, string.Empty, default);
            Assert.AreEqual(1, env.ProjectSecrets.Get(Project01).MachineData?.Corpora[Corpus01].Files.Count);
        }

        [Test]
        public async Task SyncProjectCorporaAsync_CreatesCorpusTextIfTextDoesNotExistInProjectSecretOrMachineApi()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.TextCorpusFactory
                .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
                .Returns(
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
                    )
                );

            // SUT
            Assert.AreEqual(2, env.ProjectSecrets.Get(Project02).MachineData?.Corpora[Corpus01].Files.Count);
            bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
            Assert.IsTrue(actual);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(string.Empty, string.Empty, default);
            await env.MachineCorporaService
                .ReceivedWithAnyArgs(1)
                .UploadCorpusTextAsync(string.Empty, string.Empty, string.Empty, string.Empty, default);
            Assert.AreEqual(3, env.ProjectSecrets.Get(Project02).MachineData?.Corpora[Corpus01].Files.Count);
        }

        [Test]
        public async Task SyncProjectCorporaAsync_CreatesCorpusTextIfTextExistsInProjectServerButNotMachineApi()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.TextCorpusFactory
                .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
                .Returns(
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
                    )
                );
            env.MachineCorporaService
                .GetCorpusFilesAsync(Corpus01, CancellationToken.None)
                .Returns(Task.FromResult<IList<MachineApiCorpusFile>>(Array.Empty<MachineApiCorpusFile>()));
            env.MachineCorporaService
                .UploadCorpusTextAsync(Corpus01, "en", "textId_source", Arg.Any<string>(), CancellationToken.None)
                .Returns(Task.FromResult("File03"));
            await env.ProjectSecrets.UpdateAsync(
                Project02,
                u =>
                    u.Add(
                        p => p.MachineData.Corpora[Corpus01].Files,
                        new MachineCorpusFile
                        {
                            FileChecksum = "a_previous_checksum",
                            FileId = "File03",
                            TextId = "textId_source",
                        }
                    )
            );

            // SUT
            bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
            Assert.IsTrue(actual);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(string.Empty, string.Empty, default);
            await env.MachineCorporaService
                .ReceivedWithAnyArgs(1)
                .UploadCorpusTextAsync(string.Empty, string.Empty, string.Empty, string.Empty, default);
        }

        [Test]
        public async Task SyncProjectCorporaAsync_DoesNotUpdateIfNoChanges()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.TextCorpusFactory
                .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
                .Returns(
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
                    )
                );
            env.MachineCorporaService
                .UploadCorpusTextAsync(Corpus01, "en", "textId_source", Arg.Any<string>(), CancellationToken.None)
                .Returns(Task.FromResult("File03"));
            string checksum = StringUtils.ComputeMd5Hash($"segRef\tsegment01{Environment.NewLine}");
            await env.ProjectSecrets.UpdateAsync(
                Project02,
                u =>
                    u.Add(
                        p => p.MachineData.Corpora[Corpus01].Files,
                        new MachineCorpusFile
                        {
                            FileChecksum = checksum,
                            FileId = "File03",
                            TextId = "textId_source",
                        }
                    )
            );

            // SUT
            bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
            Assert.IsFalse(actual);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(string.Empty, string.Empty, default);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .UploadCorpusTextAsync(string.Empty, string.Empty, string.Empty, string.Empty, default);
        }

        [Test]
        public async Task SyncProjectCorporaAsync_DoesNotCallMachineApiIfFeatureDisabled()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(false));

            // SUT
            bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
            Assert.IsFalse(actual);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .GetCorpusFilesAsync(Corpus01, CancellationToken.None);
        }

        [Test]
        public async Task SyncProjectCorporaAsync_DoesNotUpdateIfNoText()
        {
            // Set up test environment
            var env = new TestEnvironment();

            // SUT
            bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
            Assert.IsFalse(actual);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .DeleteCorpusFileAsync(string.Empty, string.Empty, default);
            await env.MachineCorporaService
                .DidNotReceiveWithAnyArgs()
                .UploadCorpusTextAsync(string.Empty, string.Empty, string.Empty, string.Empty, default);
        }

        [Test]
        public async Task SyncProjectCorporaAsync_UpdatesCorpusIfTextExists()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.TextCorpusFactory
                .CreateAsync(Arg.Any<IEnumerable<string>>(), TextCorpusType.Source)
                .Returns(
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
                    )
                );
            env.MachineCorporaService
                .GetCorpusFilesAsync(Corpus01, CancellationToken.None)
                .Returns(
                    Task.FromResult<IList<MachineApiCorpusFile>>(
                        new List<MachineApiCorpusFile>
                        {
                            new MachineApiCorpusFile
                            {
                                Id = "File03",
                                LanguageTag = "en",
                                TextId = "textId_source",
                            },
                        }
                    )
                );
            env.MachineCorporaService
                .UploadCorpusTextAsync(Corpus01, "en", "textId_source", Arg.Any<string>(), CancellationToken.None)
                .Returns(Task.FromResult("File03"));
            await env.ProjectSecrets.UpdateAsync(
                Project02,
                u =>
                    u.Add(
                        p => p.MachineData.Corpora[Corpus01].Files,
                        new MachineCorpusFile
                        {
                            FileChecksum = "a_previous_checksum",
                            FileId = "File03",
                            LanguageTag = "en",
                            TextId = "textId_source",
                        }
                    )
            );

            // SUT
            bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
            Assert.IsTrue(actual);
            await env.MachineCorporaService
                .ReceivedWithAnyArgs(1)
                .DeleteCorpusFileAsync(string.Empty, string.Empty, default);
            await env.MachineCorporaService
                .ReceivedWithAnyArgs(1)
                .UploadCorpusTextAsync(string.Empty, string.Empty, string.Empty, string.Empty, default);
        }

        [Test]
        public async Task SyncProjectCorporaAsync_UpdatesSourceAndTargetTexts()
        {
            // Set up test environment
            var env = new TestEnvironment();
            env.TextCorpusFactory
                .CreateAsync(Arg.Any<IEnumerable<string>>(), Arg.Any<TextCorpusType>())
                .Returns(
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
                    )
                );
            env.MachineCorporaService
                .GetCorpusFilesAsync(Corpus01, CancellationToken.None)
                .Returns(
                    Task.FromResult<IList<MachineApiCorpusFile>>(
                        new List<MachineApiCorpusFile>
                        {
                            new MachineApiCorpusFile
                            {
                                Id = "File03",
                                LanguageTag = "en",
                                TextId = "textId_source",
                            },
                            new MachineApiCorpusFile
                            {
                                Id = "File04",
                                LanguageTag = "en",
                                TextId = "textId_target",
                            },
                        }
                    )
                );
            env.MachineCorporaService
                .UploadCorpusTextAsync(Corpus01, "en", "textId_source", Arg.Any<string>(), CancellationToken.None)
                .Returns(Task.FromResult("File03"));
            env.MachineCorporaService
                .UploadCorpusTextAsync(Corpus01, "en", "textId_target", Arg.Any<string>(), CancellationToken.None)
                .Returns(Task.FromResult("File04"));
            await env.ProjectSecrets.UpdateAsync(
                Project02,
                u =>
                    u.Add(
                            p => p.MachineData.Corpora[Corpus01].Files,
                            new MachineCorpusFile
                            {
                                FileChecksum = "a_previous_checksum",
                                FileId = "File03",
                                LanguageTag = "en",
                                TextId = "textId_source",
                            }
                        )
                        .Add(
                            p => p.MachineData.Corpora[Corpus01].Files,
                            new MachineCorpusFile
                            {
                                FileChecksum = "another_previous_checksum",
                                FileId = "File04",
                                LanguageTag = "en",
                                TextId = "textId_target",
                            }
                        )
            );

            // SUT
            bool actual = await env.Service.SyncProjectCorporaAsync(User01, Project02, CancellationToken.None);
            Assert.IsTrue(actual);
            await env.MachineCorporaService
                .Received(1)
                .DeleteCorpusFileAsync(Corpus01, "File03", CancellationToken.None);
            await env.MachineCorporaService
                .Received(1)
                .DeleteCorpusFileAsync(Corpus01, "File04", CancellationToken.None);
            await env.MachineCorporaService
                .Received(1)
                .UploadCorpusTextAsync(Corpus01, "en", "textId_source", Arg.Any<string>(), CancellationToken.None);
            await env.MachineCorporaService
                .Received(1)
                .UploadCorpusTextAsync(Corpus01, "en_US", "textId_target", Arg.Any<string>(), CancellationToken.None);
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                EngineService = Substitute.For<IEngineService>();
                var logger = new MockLogger<MachineProjectService>();
                MachineBuildService = Substitute.For<IMachineBuildService>();
                MachineCorporaService = Substitute.For<IMachineCorporaService>();
                MachineTranslationService = Substitute.For<IMachineTranslationService>();
                TextCorpusFactory = Substitute.For<ITextCorpusFactory>();

                FeatureManager = Substitute.For<IFeatureManager>();
                FeatureManager.IsEnabledAsync(FeatureFlags.MachineApi).Returns(Task.FromResult(true));

                ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                    new[]
                    {
                        new SFProjectSecret { Id = Project01 },
                        new SFProjectSecret
                        {
                            Id = Project02,
                            MachineData = new MachineData
                            {
                                TranslationEngineId = TranslationEngine02,
                                Corpora = new Dictionary<string, MachineCorpus>
                                {
                                    {
                                        Corpus01,
                                        new MachineCorpus
                                        {
                                            Files = new List<MachineCorpusFile>
                                            {
                                                new MachineCorpusFile { FileId = File01 },
                                                new MachineCorpusFile { FileId = File02 },
                                            },
                                        }
                                    },
                                },
                            },
                        },
                        new SFProjectSecret { Id = Project03 },
                    }
                );

                var realtimeService = new SFMemoryRealtimeService();
                realtimeService.AddRepository(
                    "sf_projects",
                    OTType.Json0,
                    new MemoryRepository<SFProject>(
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
                                    Source = new TranslateSource { ProjectRef = Project02 },
                                },
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
                    )
                );

                Service = new MachineProjectService(
                    EngineService,
                    FeatureManager,
                    logger,
                    MachineBuildService,
                    MachineCorporaService,
                    MachineTranslationService,
                    ProjectSecrets,
                    realtimeService,
                    TextCorpusFactory
                );
            }

            public MachineProjectService Service { get; }
            public IEngineService EngineService { get; }
            public IFeatureManager FeatureManager { get; }
            public IMachineBuildService MachineBuildService { get; }
            public IMachineCorporaService MachineCorporaService { get; }
            public IMachineTranslationService MachineTranslationService { get; }
            public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
            public ITextCorpusFactory TextCorpusFactory { get; }
        }
    }
}
