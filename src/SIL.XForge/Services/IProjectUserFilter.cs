using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public interface IProjectUserFilter : IResourceMapper<ProjectUserResource, ProjectUserEntity>
    {
        List<ProjectUserEntity> AdministratorAccessibleProjectUsers(string adminUserId);
    }
}
