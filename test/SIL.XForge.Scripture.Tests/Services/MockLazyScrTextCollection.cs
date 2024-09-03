using Paratext.Data;
using Paratext.Data.ProjectFileAccess;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class MockLazyScrTextCollection : LazyScrTextCollection
{
    protected override ScrText CreateScrText(string ptUsername, ProjectName projectName) =>
        new MockScrText(new SFParatextUser(ptUsername), projectName);

    public override ResourceScrText CreateResourceScrText(
        string ptUsername,
        ProjectName projectName,
        IZippedResourcePasswordProvider passwordProvider
    ) => new MockResourceScrText(projectName, new SFParatextUser(ptUsername), new MockZippedResourcePasswordProvider());
}
