using System;
using System.IO;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public interface IProjectService<T> where T : Project
    {
        Task<string> CreateProjectAsync(string userId, T newProject);
        Task DeleteProjectAsync(string userId, string projectId);
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
