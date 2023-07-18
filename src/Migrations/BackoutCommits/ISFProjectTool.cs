using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace BackoutCommits;

public interface ISFProjectTool
{
    Task ConnectToRealtimeServiceAsync();
    Task<IDocument<SFProject>> GetProjectDocAsync(string sfProjectId);
    Task UpdateProjectRepositoryVersionAsync(IDocument<SFProject> project, string revision);
    void Dispose();
}
