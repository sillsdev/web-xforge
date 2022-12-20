using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// This class clears the selected segment checksums for all user configs of a project when the translation engine
/// finishes training. The checksums need to be reset, because the engine has been trained on any text in the
/// selected segments.
/// </summary>
public class SFBuildHandler : BuildHandler
{
    private readonly IRealtimeService _realtimeService;

    public SFBuildHandler(IRealtimeService realtimeService) => _realtimeService = realtimeService;

    public override async Task OnCompleted(BuildContext context)
    {
        using IConnection conn = await _realtimeService.ConnectAsync();
        IDocument<SFProject> project = await conn.FetchAsync<SFProject>(context.Engine.Projects.First());
        if (!project.IsLoaded)
            return;

        var tasks = new List<Task>();
        foreach (string userId in project.Data.UserRoles.Keys)
            tasks.Add(ClearSelectedSegmentChecksum(conn, project.Id, userId));
        await Task.WhenAll(tasks);
    }

    private static async Task ClearSelectedSegmentChecksum(IConnection conn, string projectId, string userId)
    {
        IDocument<SFProjectUserConfig> config = await conn.FetchAsync<SFProjectUserConfig>(
            SFProjectUserConfig.GetDocId(projectId, userId)
        );
        await config.SubmitJson0OpAsync(op => op.Unset(puc => puc.SelectedSegmentChecksum));
    }
}
