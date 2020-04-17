using System.IO;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public class LazyScrTextCollectionFactoryTests
    {
        private string _testDirectory;
        private LazyScrTextCollectionFactory _lazyScrTextCollectionFactory;
        private IFileSystemService _fileSystemService;


        [SetUp]
        public void BeforeEachTest()
        {
            _testDirectory = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName());
            _fileSystemService = Substitute.For<IFileSystemService>();
            _fileSystemService.DirectoryExists(Arg.Any<string>()).Returns(true);
            _fileSystemService.FileExists(Arg.Any<string>()).Returns(false);

            _lazyScrTextCollectionFactory = new MockLazyScrTextCollectionFactory(_fileSystemService);
            _lazyScrTextCollectionFactory.Initialize(_testDirectory);
        }

        [Test]
        public void Get_UserDoesNotExists_StillReturnsLazyScrTextCollection()
        {
            Assert.IsNotNull(_lazyScrTextCollectionFactory.Create("UserDoesNotExists"));
        }

        [Test]
        public void FindById_DoesNotExist_ReturnsNull()
        {
            string userName = "User";
            Assert.IsNull(_lazyScrTextCollectionFactory.Create(userName).FindById("projectDoesNotExist"));
        }

        [Test]
        public void FindById_SingleProjectExists_ReturnsProject()
        {
            string projectId = "Project01";
            string userName = "User";
            string projectTextName = "Proj01";
            string path = Path.Combine(_testDirectory, projectId);
            string content = $"<ScriptureText><Name>{projectTextName}</Name><guid>{projectId}</guid></ScriptureText>";
            _fileSystemService.OpenFile(Arg.Any<string>(), FileMode.Open).Returns(GetStream(content));
            _fileSystemService.EnumerateDirectories(Arg.Any<string>()).Returns(new[] { path });
            _fileSystemService.FileExists(Arg.Any<string>()).Returns(true);

            ScrText scrText = _lazyScrTextCollectionFactory.Create(userName).FindById(projectId);
            string settingsFile = Path.Combine(path, ProjectSettings.fileName);
            Assert.NotNull(scrText);
            Assert.AreEqual(projectTextName, scrText.Name);
            Assert.AreEqual(path, scrText.Directory);
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
