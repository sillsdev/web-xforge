using Paratext.Data;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class MockLazyScrTextCollection : LazyScrTextCollection
    {
        protected override ScrText CreateScrText(string ptUsername, ProjectName projectName)
        {
            var associatedPtUser = new SFParatextUser(ptUsername);
            return new MockScrText(associatedPtUser, projectName);
        }
    }
}
