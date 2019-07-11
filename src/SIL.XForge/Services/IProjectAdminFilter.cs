using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public interface IProjectAdminFilter<TEntity>
        where TEntity : class, IEntity
    {
        List<ProjectUserEntity> AdministratorAccessibleProjectUsers(string adminUserId);
    }
}
