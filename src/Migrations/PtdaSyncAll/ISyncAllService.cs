using System.Threading.Tasks;

namespace PtdaSyncAll
{
    /// <summary>
    /// Interface for service that can initiate a synchronization of all SF projects.
    /// </summary>
    public interface ISyncAllService
    {
        Task SynchronizeAllProjectsAsync(bool doSynchronizations);
    }
}
