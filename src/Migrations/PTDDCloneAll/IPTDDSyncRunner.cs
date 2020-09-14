using System.Threading.Tasks;

namespace PTDDCloneAll
{
    // An interface that makes it possible to register a PTDDSyncRunner to the DI container in a way where
    // other services can request this using a factory function
    public interface IPTDDSyncRunner
    {
        Task RunAsync(string projectId, string userId, bool trainEngine, bool silent);
    }
}
