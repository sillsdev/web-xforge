using System;
using System.Threading.Tasks;

namespace SIL.XForge.Services;

public interface IProjectService
{
    Task AddUserAsync(string curUserId, string projectId, string projectRole = null);
    Task RemoveUserAsync(string curUserId, string projectId, string projectUserId);
    Task RemoveUserWithoutPermissionsCheckAsync(string curUserId, string projectId, string projectUserId);
    Task<string> GetProjectRoleAsync(string curUserId, string projectId);
    Task UpdateRoleAsync(string curUserId, string[] systemRoles, string projectId, string userId, string projectRole);
    Task<Uri> SaveAudioAsync(string curUserId, string projectId, string dataId, string path);
    Task DeleteAudioAsync(string curUserId, string projectId, string ownerId, string dataId);
    Task SetSyncDisabledAsync(string curUserId, string[] systemRoles, string projectId, bool isDisabled);
    Task RemoveUserFromAllProjectsAsync(string curUserId, string projectUserId);
    Task SetRoleProjectPermissionsAsync(string curUserId, string projectId, string role, string[] permissions);
    Task SetUserProjectPermissionsAsync(string curUserId, string projectId, string userId, string[] permissions);
}
