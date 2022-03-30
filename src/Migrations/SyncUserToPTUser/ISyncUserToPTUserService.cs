using System.Collections.Generic;
using System.Threading.Tasks;

namespace SyncUserToPTUser
{
    interface ISyncUserToPTUserService
    {
        Task MoveSyncUsersToProject(bool dryRun, ISet<string> sfProjectIdsToUpdate);
    }
}
