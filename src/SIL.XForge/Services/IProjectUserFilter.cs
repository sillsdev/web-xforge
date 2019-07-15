using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public interface IProjectUserFilter<TResource, TEntity, TProjectEntity> : IResourceMapper<TResource, TEntity>
        where TResource : class, IResource
        where TEntity : class, IEntity
        where TProjectEntity : class, IEntity
    {
        List<ProjectUserEntity> AdministratorAccessibleProjectUsers(string adminUserId);
    }
}
