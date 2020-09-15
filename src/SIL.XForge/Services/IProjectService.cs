using System;
using System.IO;
using System.Threading.Tasks;

namespace SIL.XForge.Services
{
    public interface IProjectService
    {
        Task AddUserAsync(string curUserId, string projectId, string projectRole = null);
        Task RemoveUserAsync(string curUserId, string projectId, string projectUserId);
        Task UpdateRoleAsync(string curUserId, string systemRole, string projectId, string projectRole);
        Task<Uri> SaveAudioAsync(string curUserId, string projectId, string dataId, string extension,
            Stream inputStream);
        Task DeleteAudioAsync(string curUserId, string projectId, string ownerId, string dataId);
        Task SetSyncDisabledAsync(string curUserId, string systemRole, string projectId, bool isDisabled);
    }
}
