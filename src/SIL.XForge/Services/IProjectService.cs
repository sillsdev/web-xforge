using System;
using System.IO;
using System.Threading.Tasks;

namespace SIL.XForge.Services;

public interface IProjectService
{
    Task AddUserAsync(string curUserId, string projectId, string projectRole = null);
    Task RemoveUserAsync(string curUserId, string projectId, string projectUserId);
    Task RemoveUserWithoutPermissionsCheckAsync(string curUserId, string projectId, string projectUserId);
    Task<string> GetProjectRoleAsync(string curUserId, string projectId);
    Task UpdateRoleAsync(string curUserId, string systemRole, string projectId, string projectRole);
    Task<Uri> SaveAudioAsync(string curUserId, string projectId, string dataId, string extension, Stream inputStream);
    Task DeleteAudioAsync(string curUserId, string projectId, string ownerId, string dataId);
    Task SetSyncDisabledAsync(string curUserId, string systemRole, string projectId, bool isDisabled);
    Task RemoveUserFromAllProjectsAsync(string curUserId, string projectUserId);
    Task SetUserProjectPermissions(string curUserId, string projectId, string userId, string[] permissions);
}
