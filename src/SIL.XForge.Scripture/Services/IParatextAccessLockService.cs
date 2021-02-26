using System.Net.Http;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextAccessLockService
    {
        /// <summary> Provides a lock on access to the Paratext API for a given user, along with an up-to-date access
        /// token for the user. The lock MUST be disposed after use so that another thread, or the same thread, can
        /// later call the API, and not cause a permanent lock for the user. </summary>
        public Task<ParatextAccessLock> GetLock(string userId, HttpClient client);
    }
}
