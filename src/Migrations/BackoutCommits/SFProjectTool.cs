using System.Collections.Generic;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace BackoutCommits;

public class SFProjectTool : ISFProjectTool
{
    private IConnection realtimeServiceConnection;

    // To detect redundant calls
    private bool disposedValue = false;

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

    public List<SFProject> GetProjectSnapshots()
    {
        return RealtimeService.QuerySnapshots<SFProject>().ToList();
    }

    public async Task UpdateProjectRepositoryVersionAsync(IDocument<SFProject> projectDoc, string revision)
    {
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            op.Set(p => p.Sync.SyncedToRepositoryVersion, revision);
        });
    }

    public async Task ResetProjectQueuedCountAsync(IDocument<SFProject> projectDoc, int queuedCount)
    {
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            op.Set(p => p.Sync.QueuedCount, queuedCount);
        });
    }

    public async Task IncrementProjectQueuedCountAsync(IDocument<SFProject> projectDoc)
    {
        await projectDoc.SubmitJson0OpAsync(op =>
        {
            op.Inc(p => p.Sync.QueuedCount, 1);
        });
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    protected virtual void Dispose(bool disposing)
    {
        if (!disposedValue)
        {
            if (disposing)
            {
                realtimeServiceConnection?.Dispose();
            }

            realtimeServiceConnection = null;
            disposedValue = true;
        }
    }
}
