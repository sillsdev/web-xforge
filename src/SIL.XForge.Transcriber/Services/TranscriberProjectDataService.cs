using AutoMapper;
using JsonApiDotNetCore.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;
using SIL.XForge.Transcriber.Models;

namespace SIL.XForge.Transcriber.Services
{
    public abstract class TranscriberProjectDataService<TResource, TEntity>
        : ProjectDataService<TResource, TEntity, TranscriberProjectEntity>
        where TResource : ProjectDataResource
        where TEntity : ProjectDataEntity
    {
        protected TranscriberProjectDataService(IJsonApiContext jsonApiContext, IMapper mapper,
            IUserAccessor userAccessor, IRepository<TEntity> entities, IRepository<TranscriberProjectEntity> projects)
            : base(jsonApiContext, mapper, userAccessor, entities, projects)
        {
        }
    }
}
