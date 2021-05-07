using System.Threading.Tasks;

namespace PTDDCloneAll
{
    /// <summary>
    /// An interface that makes it possible to register a PTDDSyncRunner to the DI container in a way where
    /// other services can request this using a factory function
    /// </summary>
    public interface IPTDDSyncRunner
    {
        Task RunAsync(string projectId, string userId, bool trainEngine, bool silent, bool pushLocal);
    }
}
