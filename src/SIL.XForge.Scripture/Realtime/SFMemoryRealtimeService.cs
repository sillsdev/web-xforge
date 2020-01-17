using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.NodeServices.HostingModels;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Realtime
{
    public class SFMemoryRealtimeService : MemoryRealtimeService
    {
        public override async Task DeleteProjectAsync(string projectId)
        {
            // RealtimeService.DeleteProjectAsync works differently and
            // does not crash if the project doc was already deleted in
            // SFProjectService DeleteProjectAsync(). So don't crash
            // here either to mimic the production behaviour.
            try
            {
                await GetRepository<SFProject>().DeleteAsync(projectId);
            }
            catch (NodeInvocationException e)
            {
                Console.WriteLine($"Warning: {nameof(SFMemoryRealtimeService)}.{nameof(DeleteProjectAsync)} ignoring {nameof(NodeInvocationException)} for projectId {projectId} to mimic production behavior.");
            }
            await GetRepository<SFProjectUserConfig>().DeleteAllAsync(puc => puc.Id.StartsWith(projectId));
        }
    }
}
