using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public class MockLazyScrTextCollection : LazyScrTextCollection
    {
        protected override ScrText CreateScrText(string username, ProjectName projectName)
        {
            return new MockScrText(projectName);
        }
    }
}
