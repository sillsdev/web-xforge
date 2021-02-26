using Microsoft.Extensions.Options;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public class ParatextAccessLockService : IParatextAccessLockService
    {
        private readonly IJwtTokenHelper _jwtTokenHelper;
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IOptions<ParatextOptions> _paratextOptions;

        /// <summary> Map user IDs to semaphores </summary>
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _tokenRefreshSemaphores = new ConcurrentDictionary<string, SemaphoreSlim>();
        public ParatextAccessLockService(IJwtTokenHelper jwtTokenHelper, IRepository<UserSecret> userSecrets, IOptions<ParatextOptions> paratextOptions)
        {

            _jwtTokenHelper = jwtTokenHelper;
            _userSecrets = userSecrets;
            _paratextOptions = paratextOptions;
        }

        public async Task<ParatextAccessLock> GetLock(string userId, HttpClient client)
        {
            SemaphoreSlim semaphore = _tokenRefreshSemaphores.GetOrAdd(userId, (string key) => new SemaphoreSlim(1, 1));
            await semaphore.WaitAsync();

            UserSecret userSecret = (await this.GetLatestUserSecretFromDBAsync(userId));

            if (!userSecret.ParatextTokens.ValidateLifetime())
            {
                Tokens refreshedUserTokens = await _jwtTokenHelper.RefreshAccessTokenAsync(_paratextOptions.Value, userSecret.ParatextTokens, client);
                userSecret = await _userSecrets.UpdateAsync(userId, b => b.Set(u => u.ParatextTokens, refreshedUserTokens));
            }
            return new ParatextAccessLock(semaphore, userSecret);
        }

        private async Task<UserSecret> GetLatestUserSecretFromDBAsync(string userId)
        {
            Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(userId);
            if (!attempt.TryResult(out UserSecret userSecret))
            {
                throw new DataNotFoundException("Could not find user secrets");
            }
            return userSecret;
        }
    }

    public class ParatextAccessLock : DisposableBase
    {
        private SemaphoreSlim _userSemaphore;
        public readonly UserSecret UserSecret;

        public ParatextAccessLock(SemaphoreSlim userSemaphore, UserSecret userSecret)
        {
            _userSemaphore = userSemaphore;
            UserSecret = userSecret;
        }

        protected override void DisposeManagedResources()
        {
            _userSemaphore.Release();
        }
    }
}
