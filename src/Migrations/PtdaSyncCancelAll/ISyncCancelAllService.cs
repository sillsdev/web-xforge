using System.Collections.Generic;
using System.Threading.Tasks;

namespace PtdaSyncCancelAll
{
    /// <summary>
    /// Interface for service that can initiate a synchronization cancel of all SF projects.
    /// </summary>
    public interface ISyncCancelAllService
    {
        Task SynchronizeCancelAllProjectsAsync(ISet<string> sfProjectIdsToSynchronize = null);
    }
}
