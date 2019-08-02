using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using SIL.Machine.WebApi.Models;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;

public class SFBuildHandler : BuildHandler
{
    private readonly IRealtimeService _realtimeService;

    public SFBuildHandler(IRealtimeService realtimeService)
    {
        _realtimeService = realtimeService;
    }

    public override async Task OnCompleted(BuildContext context)
    {
        using (IConnection conn = await _realtimeService.ConnectAsync())
        {
            IDocument<SFProject> project = conn.Get<SFProject>(RootDataTypes.Projects, context.Engine.Projects.First());
            await project.FetchAsync();
            if (!project.IsLoaded)
                return;

            var tasks = new List<Task>();
            foreach (string userId in project.Data.UserRoles.Keys)
                tasks.Add(ClearSelectedSegmentChecksum(conn, project.Id, userId));
            await Task.WhenAll(tasks);
        }
    }

    private async Task ClearSelectedSegmentChecksum(IConnection conn, string projectId, string userId)
    {
        IDocument<SFProjectUserConfig> config = conn.Get<SFProjectUserConfig>(SFRootDataTypes.ProjectUserConfigs,
            SFProjectUserConfig.GetDocId(projectId, userId));
        await config.FetchAsync();
        await config.SubmitJson0OpAsync(op => op.Unset(puc => puc.SelectedSegmentChecksum));
    }
}
