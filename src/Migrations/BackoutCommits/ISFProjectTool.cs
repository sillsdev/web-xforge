using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace BackoutCommits;

public interface ISFProjectTool : IDisposable
{
    Task ConnectToRealtimeServiceAsync();
    Task<IDocument<SFProject>> GetProjectDocAsync(string sfProjectId);
    Task UpdateProjectRepositoryVersionAsync(IDocument<SFProject> project, string revision);
}
