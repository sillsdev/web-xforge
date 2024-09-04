using Paratext.Data;
using Paratext.Data.ProjectFileAccess;

namespace SIL.XForge.Scripture.Services;

public interface IScrTextCollection
{
    void Initialize(string settingsDir = null);
    ScrText? FindById(string username, string projectId);

    ResourceScrText CreateResourceScrText(
        string ptUsername,
        ProjectName projectName,
        IZippedResourcePasswordProvider passwordProvider
    );
}
