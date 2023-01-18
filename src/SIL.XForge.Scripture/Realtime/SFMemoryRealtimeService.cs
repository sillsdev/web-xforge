using System.Threading.Tasks;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Realtime;

public class SFMemoryRealtimeService : MemoryRealtimeService
{
    public override async Task DeleteProjectAsync(string projectId)
    {
        await GetRepository<SFProject>().DeleteAsync(projectId);
        await GetRepository<SFProjectUserConfig>().DeleteAllAsync(puc => puc.Id.StartsWith(projectId));
    }
}
