using AutoMapper;
using JsonApiDotNetCore.Services;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public class TestProjectService : ProjectService<TestProjectResource, TestProjectEntity>
    {
        public TestProjectService(IJsonApiContext jsonApiContext, IMapper mapper, IUserAccessor userAccessor,
            IRepository<TestProjectEntity> projects, IOptions<SiteOptions> siteOptions)
            : base(jsonApiContext, mapper, userAccessor, projects, siteOptions)
        {
        }
    }
}
