using System.Collections.Generic;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace BackoutCommits;

public interface ISFProjectTool : IDisposable
{
    Task ConnectToRealtimeServiceAsync();
    Task<IDocument<SFProject>> GetProjectDocAsync(string sfProjectId);
    List<SFProject> GetProjectSnapshots();
    Task UpdateProjectRepositoryVersionAsync(IDocument<SFProject> project, string revision);
    Task ResetProjectQueuedCountAsync(IDocument<SFProject> project, int queuedCount);
    Task IncrementProjectQueuedCountAsync(IDocument<SFProject> project);
}
