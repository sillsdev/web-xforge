using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace BackoutCommits;

public class SFProjectTool : ISFProjectTool
{
    private IConnection? realtimeServiceConnection;

    public SFProjectTool(IRealtimeService realtimeService, IParatextService paratextService)
    {
        RealtimeService = realtimeService;
        ParatextService = paratextService;
    }

    public IRealtimeService RealtimeService { get; }

    public IParatextService ParatextService { get; }

    public async Task ConnectToRealtimeServiceAsync()
    {
        realtimeServiceConnection = await RealtimeService.ConnectAsync();
    }

    public async Task<IDocument<SFProject>> GetProjectDocAsync(string sfProjectId)
    {
        if (realtimeServiceConnection == null)
            throw new InvalidOperationException("Must call ConnectToRealtimeServiceAsync first.");
        return await realtimeServiceConnection.FetchAsync<SFProject>(sfProjectId);
    }

    public async Task UpdateProjectRepositoryVersionAsync(IDocument<SFProject> projectDoc, string revision)
    {
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            op.Set(p => p.Sync.SyncedToRepositoryVersion, revision);
        });
    }

    public void Dispose()
    {
        realtimeServiceConnection?.Dispose();
    }
}
