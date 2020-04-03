using System.IO;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;

namespace SIL.XForge.Scripture.Services
{
    public class MultiUserLazyScrTextCollectionTests
    {
        string _testDirectory;

        [SetUp]
        public void BeforeEachTest()
        {
            _testDirectory = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName());
            MultiUserLazyScrTextCollection.Initialize(_testDirectory);
        }

        [TearDown]
        public void AfterEachTest()
        {
            try
            {
                Directory.Delete(_testDirectory, true);
            }
            catch { };
        }

        [Test]
        public void Get_UserDoesNotExists_StillReturnsLazyScrTextCollection()
        {
            Assert.IsNotNull(MultiUserLazyScrTextCollection.Get("UserDoesNotExists"));
        }

        [Test]
        public void Find_ProjectDoesNotExists_ReturnsNull()
        {
            ScrText scrText = MultiUserLazyScrTextCollection.Get("User").Find("ProjectDoesNotExist");
            Assert.IsNull(scrText);
        }

        [Test]
        public void Find_ProjectExists_ReturnsProject()
        {
            string projectId = "Project01";
            string userName = "User";
            string projectTextName = "Text01";

            string path = Path.Combine(_testDirectory, userName, projectId);
            Directory.CreateDirectory(path);
            File.WriteAllText(Path.Combine(path, ProjectSettings.fileName),
                $"<ScriptureText><Name>{projectTextName}</Name></ScriptureText>");

            LazyScrTextCollection lazySTC = MultiUserLazyScrTextCollection.Get(userName);
            ScrText scrText = lazySTC.Find(path);
            Assert.AreEqual(Path.Combine(_testDirectory, userName), lazySTC.SettingsDirectory);
            Assert.NotNull(scrText);
            Assert.AreEqual(path, scrText.Directory);
            Assert.AreEqual(projectTextName, scrText.Name);
        }

        [Test]
        public void FindById_DoesNotExist_ReturnsNull()
        {
            string userName = "User";
            Directory.CreateDirectory(Path.Combine(_testDirectory, userName));
            Assert.IsNull(MultiUserLazyScrTextCollection.Get("User").FindById("projectDoesNotExist"));
        }

        [Test]
        public void FindById_SingleProjectExists_ReturnsProject()
        {
            string projectId = "Project01";
            string userName = "User";
            string projectTextName = "Text01";
            string path = Path.Combine(_testDirectory, userName, projectId);
            Directory.CreateDirectory(path);
            File.WriteAllText(Path.Combine(path, ProjectSettings.fileName),
                $"<ScriptureText><Name>{projectTextName}</Name><Guid>{projectId}</Guid></ScriptureText>");

            ScrText scrText = MultiUserLazyScrTextCollection.Get("User").FindById(projectId);
            Assert.NotNull(scrText);
            Assert.AreEqual(projectTextName, scrText.Name);
        }
    }
}
