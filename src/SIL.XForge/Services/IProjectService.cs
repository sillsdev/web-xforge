using System;
using System.IO;
using System.Threading.Tasks;

namespace SIL.XForge.Services
{
    public interface IProjectService
    {
        Task AddUserAsync(string userId, string projectId, string projectRole = null);
        Task RemoveUserAsync(string userId, string projectId, string projectUserId);
        Task UpdateRoleAsync(string userId, string projectId, string projectRole);
        Task<bool> InviteAsync(string userId, string projectId, string email);
        Task<bool> IsAlreadyInvitedAsync(string userId, string projectId, string email);
        Task CheckLinkSharingAsync(string userId, string projectId, string shareKey = null);
        Task<bool> IsAuthorizedAsync(string projectId, string userId);
        Task<Uri> SaveAudioAsync(string id, string name, Stream inputStream);
    }
}
