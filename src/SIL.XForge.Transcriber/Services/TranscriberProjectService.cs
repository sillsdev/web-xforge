using AutoMapper;
using JsonApiDotNetCore.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Services;
using SIL.XForge.Transcriber.Models;

namespace SIL.XForge.Transcriber.Services
{
    public class TranscriberProjectService : ProjectService<TranscriberProjectResource, TranscriberProjectEntity>
    {
        public TranscriberProjectService(IJsonApiContext jsonApiContext, IMapper mapper, IUserAccessor userAccessor,
            IRepository<TranscriberProjectEntity> projects)
            : base(jsonApiContext, mapper, userAccessor, projects)
        {
        }
    }
}
