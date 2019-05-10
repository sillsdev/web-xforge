using System.Threading.Tasks;
using IdentityModel;
using IdentityServer4.Validation;
using Microsoft.AspNetCore.Authentication;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Identity.Services
{
    public class UserResourceOwnerPasswordValidator : IResourceOwnerPasswordValidator
    {
        private readonly IRepository<UserEntity> _users;
        private readonly ISystemClock _clock;

        public UserResourceOwnerPasswordValidator(IRepository<UserEntity> users, ISystemClock clock)
        {
            _users = users;
            _clock = clock;
        }

        public async Task ValidateAsync(ResourceOwnerPasswordValidationContext context)
        {
            Attempt<UserEntity> attempt = await _users.TryGetByIdentifier(context.UserName);
            if (attempt.TryResult(out UserEntity user) && user.VerifyPassword(context.Password))
            {
                context.Result = new GrantValidationResult(user.Id, OidcConstants.AuthenticationMethods.Password,
                    _clock.UtcNow.UtcDateTime, user.GetClaims());
            }
        }
    }
}
