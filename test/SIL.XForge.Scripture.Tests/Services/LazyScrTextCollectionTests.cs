using System.IO;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public class LazyScrTextCollectionTests
    {
        private string _testDirectory;
        private LazyScrTextCollection _lazyScrTextCollection;
        private IFileSystemService _fileSystemService;


        [SetUp]
        public void BeforeEachTest()
        {
            _testDirectory = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName());
            _fileSystemService = Substitute.For<IFileSystemService>();
            _fileSystemService.DirectoryExists(Arg.Any<string>()).Returns(true);
            _fileSystemService.FileExists(Arg.Any<string>()).Returns(false);

            _lazyScrTextCollection = new MockLazyScrTextCollection();
            _lazyScrTextCollection.Initialize(_testDirectory);
            _lazyScrTextCollection.FileSystemService = _fileSystemService;
        }

        [Test]
        public void FindById_DoesNotExist_ReturnsNull()
        {
            string username = "User";
            Assert.IsNull(_lazyScrTextCollection.FindById(username, "projectDoesNotExist", Models.TextType.Target));
        }

        [Test]
        public void FindById_TargetProjectExists_ReturnsProject()
        {
            string projectId = "Project01";
            string username = "User";
            string projectTextName = "Proj01";
            string path = Path.Combine(_testDirectory, projectId, "target");
            string content = $"<ScriptureText><Name>{projectTextName}</Name><guid>{projectId}</guid></ScriptureText>";
            _fileSystemService.OpenFile(Arg.Any<string>(), FileMode.Open).Returns(GetStream(content));
            _fileSystemService.FileExists(Arg.Any<string>()).Returns(true);

            ScrText scrText = _lazyScrTextCollection.FindById(username, projectId, Models.TextType.Target);
            Assert.NotNull(scrText);
            Assert.AreEqual(projectTextName, scrText.Name);
            Assert.AreEqual(path, scrText.Directory);
            _fileSystemService.Received(1).FileExists(Path.Combine(path, ProjectSettings.fileName));
        }

        [Test]
        public void FindById_SourceProjectExists_ReturnsProject()
        {
            string targetProjectId = "target01";
            string sourceProjectId = "source01";
            string username = "User";
            string sourceTextName = "Src01";
            string path = Path.Combine(_testDirectory, targetProjectId, "source");
            string content =
                $"<ScriptureText><Name>{sourceTextName}</Name><guid>{sourceProjectId}</guid></ScriptureText>";

            _fileSystemService.OpenFile(Arg.Any<string>(), FileMode.Open).Returns(GetStream(content));
            _fileSystemService.FileExists(Arg.Any<string>()).Returns(true);

            ScrText scrText = _lazyScrTextCollection.FindById(username, targetProjectId, Models.TextType.Source);
            Assert.NotNull(scrText);
            Assert.AreEqual(sourceTextName, scrText.Name);
            Assert.AreEqual(path, scrText.Directory);
            _fileSystemService.Received(1).FileExists(Path.Combine(path, ProjectSettings.fileName));
        }

        private static Stream GetStream(string content)
        {
            var stream = new MemoryStream();
            var writer = new StreamWriter(stream);
            writer.Write(content);
            writer.Flush();
            stream.Position = 0;
            return stream;
        }
    }
}
