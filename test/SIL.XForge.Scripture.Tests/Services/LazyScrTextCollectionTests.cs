using System.IO;
using NSubstitute;
using NSubstitute.Extensions;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using SIL.Scripture;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class LazyScrTextCollectionTests
{
    private readonly HexId _project01 = HexId.CreateNew();
    private readonly HexId _project02 = HexId.CreateNew();
    private const string User01 = "user01";
    private const string Project01Name = "Proj01";
    private const string Project02Name = "Proj02";

    [Test]
    public void FindById_BaseProject_Missing()
    {
        // Setup
        var env = new TestEnvironment();
        string path = env.ConfigureProject(
            User01,
            _project01,
            Project01Name,
            SettingsFormat.Paratext8,
            baseProjectId: _project02,
            baseProjectName: Project02Name
        );

        // SUT
        ScrText? scrText = env.Service.FindById(User01, _project01.Id);

        Assert.That(scrText, Is.Not.Null);
        Assert.That(scrText?.Name, Is.EqualTo(Project01Name));
        Assert.That(scrText?.Directory, Is.EqualTo(path));
        env.FileSystemService.Received(1)
            .DirectoryExists(Arg.Is<string>(s => s.EndsWith(Path.Combine(_project02.Id, "target"))));
    }

    [Test]
    public void FindById_BaseProject_NoSettings()
    {
        // Setup
        var env = new TestEnvironment();
        string path = env.ConfigureProject(
            User01,
            _project01,
            Project01Name,
            SettingsFormat.Paratext8,
            baseProjectId: _project02,
            baseProjectName: Project02Name
        );
        string basePath = env.ConfigureProject(User01, _project02, Project02Name, SettingsFormat.None);

        // SUT
        ScrText? scrText = env.Service.FindById(User01, _project01.Id);

        Assert.That(scrText, Is.Not.Null);
        Assert.That(scrText?.Name, Is.EqualTo(Project01Name));
        Assert.That(scrText?.Directory, Is.EqualTo(path));
        env.FileSystemService.Received(1).FileExists(Path.Join(path, ProjectSettings.fileName));
        env.FileSystemService.Received(1).FileExists(Path.Join(basePath, ProjectSettings.fileName));
    }

    [Test]
    public void FindById_BaseProject_UsesBaseVersification()
    {
        // Setup
        var env = new TestEnvironment();
        string path = env.ConfigureProject(
            User01,
            _project01,
            Project01Name,
            SettingsFormat.Paratext8,
            baseProjectId: _project02,
            baseProjectName: Project02Name
        );
        string basePath = env.ConfigureProject(
            User01,
            _project02,
            Project02Name,
            SettingsFormat.Paratext8,
            ScrVers.Vulgate
        );

        // SUT
        ScrText? scrText = env.Service.FindById(User01, _project01.Id);

        Assert.That(scrText, Is.Not.Null);
        Assert.That(scrText?.Name, Is.EqualTo(Project01Name));
        Assert.That(scrText?.Directory, Is.EqualTo(path));
        Assert.That(scrText?.Settings.Versification.Type, Is.EqualTo(ScrVers.Vulgate.Type));
        env.FileSystemService.Received(1).FileExists(Path.Join(path, ProjectSettings.fileName));
        env.FileSystemService.Received(1).FileExists(Path.Join(basePath, ProjectSettings.fileName));
    }

    [Test]
    public void FindById_DoesNotExist_ReturnsNull()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.That(env.Service.FindById(User01, "projectDoesNotExist"), Is.Null);
    }

    [Test]
    public void FindById_EmptyName_ReturnsNull()
    {
        // Setup
        var env = new TestEnvironment();
        string path = env.ConfigureProject(User01, _project01, string.Empty, SettingsFormat.Paratext8);

        // SUT
        Assert.That(env.Service.FindById(User01, _project01.Id), Is.Null);

        env.FileSystemService.Received(1).FileExists(Path.Join(path, ProjectSettings.fileName));
    }

    [Test]
    public void FindById_NoSettings_ReturnsNull()
    {
        // Setup
        var env = new TestEnvironment();
        string path = env.ConfigureProject(User01, _project01, Project01Name, SettingsFormat.None);

        // SUT
        Assert.That(env.Service.FindById(User01, _project01.Id), Is.Null);

        env.FileSystemService.Received(1).FileExists(Path.Join(path, ProjectSettings.fileName));
        env.FileSystemService.Received(1).EnumerateFiles(path, "*.ssf");
    }

    [Test]
    public void FindById_NullProjectId_ReturnsNull()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.That(env.Service.FindById(User01, null), Is.Null);
    }

    [Test]
    public void FindById_Paratext8_ReturnsProject()
    {
        // Setup
        var env = new TestEnvironment();
        string path = env.ConfigureProject(User01, _project01, Project01Name, SettingsFormat.Paratext8);

        // SUT
        ScrText? scrText = env.Service.FindById(User01, _project01.Id);

        Assert.That(scrText, Is.Not.Null);
        Assert.That(scrText?.Name, Is.EqualTo(Project01Name));
        Assert.That(scrText?.Directory, Is.EqualTo(path));
        env.FileSystemService.Received(1).FileExists(Path.Join(path, ProjectSettings.fileName));
    }

    [Test]
    public void FindById_Paratext7_ReturnsProject()
    {
        // Setup
        var env = new TestEnvironment();
        string path = env.ConfigureProject(User01, _project01, Project01Name, SettingsFormat.Paratext7);

        // SUT
        ScrText? scrText = env.Service.FindById(User01, _project01.Id);

        Assert.That(scrText, Is.Not.Null);
        Assert.That(scrText?.Name, Is.EqualTo(Project01Name));
        Assert.That(scrText?.Directory, Is.EqualTo(path));
        env.FileSystemService.Received(1).FileExists(Path.Join(path, ProjectSettings.fileName));
        env.FileSystemService.Received(1).EnumerateFiles(path, "*.ssf");
    }

    private class TestEnvironment
    {
        private readonly string _testDirectory;

        public TestEnvironment()
        {
            _testDirectory = Path.Join(Path.GetTempPath(), Path.GetRandomFileName());
            FileSystemService = Substitute.For<IFileSystemService>();

            Service = Substitute.ForPartsOf<LazyScrTextCollection>();
            Service.Initialize(_testDirectory);
            Service.FileSystemService = FileSystemService;
        }

        public IFileSystemService FileSystemService { get; }
        public LazyScrTextCollection Service { get; }

        /// <summary>
        /// Configures a project for the text
        /// </summary>
        /// <param name="userId">The Paratext user identifier.</param>
        /// <param name="projectId">The Paratext project identifier.</param>
        /// <param name="projectName">The project name.</param>
        /// <param name="settingsFormat">The Paratext Settings file format</param>
        /// <param name="scrVers">Optional. The project versification.</param>
        /// <param name="baseProjectId">Optional. The base project identifier.</param>
        /// <param name="baseProjectName">Optional. The base project name.</param>
        /// <returns>
        /// The path to the project.
        /// </returns>
        public string ConfigureProject(
            string userId,
            HexId projectId,
            string projectName,
            SettingsFormat settingsFormat,
            ScrVers? scrVers = null,
            HexId? baseProjectId = null,
            string baseProjectName = ""
        )
        {
            // Configure the project "on disk"
            string projectPath = Path.Join(_testDirectory, projectId.Id);
            string targetPath = Path.Join(projectPath, "target");
            string versification = scrVers is null
                ? string.Empty
                : $"<Versification>{(int)scrVers.Type}</Versification>";
            string content =
                $"<ScriptureText><Name>{projectName}</Name><Guid>{projectId.Id}</Guid>{versification}</ScriptureText>";
            FileSystemService
                .FileReadText(Arg.Is<string>(s => !string.IsNullOrEmpty(s) && s.StartsWith(targetPath)))
                .Returns(content);
            FileSystemService
                .DirectoryExists(Arg.Is<string>(s => !string.IsNullOrEmpty(s) && s.StartsWith(projectPath)))
                .Returns(true);
            switch (settingsFormat)
            {
                case SettingsFormat.Paratext7:
                    FileSystemService
                        .EnumerateFiles(targetPath, "*.ssf")
                        .Returns([Path.Join(targetPath, $"{projectName}.ssf")]);
                    break;
                case SettingsFormat.Paratext8:
                    FileSystemService.FileExists(Path.Join(targetPath, ProjectSettings.fileName)).Returns(true);
                    break;
                case SettingsFormat.None:
                default:
                    // No settings file present
                    break;
            }

            // Configure the service to return the scripture text
            var scrText = new MockScrText(
                new SFParatextUser(userId),
                new ProjectName { ProjectPath = targetPath, ShortName = projectName }
            );
            if (baseProjectId is not null)
            {
                scrText.Settings.TranslationInfo = new TranslationInformation(
                    ProjectType.BackTranslation,
                    baseProjectName,
                    baseProjectId
                );
            }
            Service
                .Configure()
                .CreateScrText(Arg.Any<string>(), Arg.Is<ProjectName>(p => p.ShortName == projectName))
                .Returns(scrText);

            return targetPath;
        }
    }

    private enum SettingsFormat
    {
        None,
        Paratext7,
        Paratext8,
    }
}
