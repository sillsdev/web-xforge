using System.Collections.Generic;
using System.Threading.Tasks;

namespace BackoutCommits;

/// <summary>
/// Interface for service that can initiate a synchronization of all SF projects.
/// </summary>
public interface ISyncAllService
{
    Task SynchronizeAllProjectsAsync(
        bool doSynchronizations,
        ISet<string> sfProjectIdsToSynchronize,
        string projectRootDir,
        IDictionary<string, string> sfAdminsToUse = null
    );
}
