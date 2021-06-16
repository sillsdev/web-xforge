using Paratext.Data;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public class MockScopedScrTextCollection : ScopedScrTextCollection
    {
        public MockScopedScrTextCollection(IFileSystemService fileSystemService, string projectsPath)
            : base(fileSystemService, projectsPath)
        {
        }

        protected override ScrText CreateScrText(string ptUsername, ProjectName projectName)
        {
            var associatedPtUser = new SFParatextUser(ptUsername);
            return new MockScrText(associatedPtUser, projectName);
        }
    }
}
