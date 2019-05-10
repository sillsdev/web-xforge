using System.Threading.Tasks;
using IdentityServer4.Extensions;
using IdentityServer4.Models;
using IdentityServer4.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Identity.Services
{
    public class UserProfileService : IProfileService
    {
        private readonly IRepository<UserEntity> _users;

        public UserProfileService(IRepository<UserEntity> users)
        {
            _users = users;
        }

        public async Task GetProfileDataAsync(ProfileDataRequestContext context)
        {
            Attempt<UserEntity> attempt = await _users.TryGetAsync(context.Subject.GetSubjectId());
            if (attempt.TryResult(out UserEntity user))
                context.AddRequestedClaims(user.GetClaims());
        }

        public async Task IsActiveAsync(IsActiveContext context)
        {
            Attempt<UserEntity> attempt = await _users.TryGetAsync(context.Subject.GetSubjectId());
            if (attempt.TryResult(out UserEntity user))
                context.IsActive = user.Active;
            else
                context.IsActive = false;
        }
    }
}
