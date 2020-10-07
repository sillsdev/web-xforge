using Paratext.Data;
using Paratext.Data.Users;
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
