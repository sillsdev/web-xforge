using System.Collections.Generic;
using System.Threading.Tasks;

namespace SyncCancel
{
    /// <summary>
    /// Interface for service that can initiate a synchronization cancel of all SF projects.
    /// </summary>
    public interface ISyncCancelService
    {
        Task SynchronizeCancelProjectsAsync(ISet<string> sfProjectIdsToSynchronize = null);
    }
}
