using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public class MockLazyScrTextCollection : LazyScrTextCollection
    {
        public MockLazyScrTextCollection(string projectsPath, string username) : base(projectsPath, username)
        {
        }

        protected override ScrText CreateScrText(ProjectName projectName)
        {
            return new MockScrText(projectName);
        }
    }
}
