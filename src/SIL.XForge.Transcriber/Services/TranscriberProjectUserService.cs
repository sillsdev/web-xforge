using AutoMapper;
using JsonApiDotNetCore.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Services;
using SIL.XForge.Transcriber.Models;

namespace SIL.XForge.Transcriber.Services
{
    public class TranscriberProjectUserService
        : ProjectUserService<TranscriberProjectUserResource, TranscriberProjectUserEntity, TranscriberProjectEntity>
    {
        public TranscriberProjectUserService(IJsonApiContext jsonApiContext, IMapper mapper, IUserAccessor userAccessor,
            IRepository<TranscriberProjectEntity> projects)
            : base(jsonApiContext, mapper, userAccessor, projects)
        {
        }
    }
}
