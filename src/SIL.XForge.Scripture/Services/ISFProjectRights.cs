using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services;

public interface ISFProjectRights
{
    bool HasRight(Project project, string? userId, string projectDomain, string operation, IOwnedData? data = null);
    bool RoleHasRight(Project project, string role, string projectDomain, string operation);
}
