using System.Collections.Generic;
using AutoMapper;
using JsonApiDotNetCore.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public class TestProjectUserService
        : ProjectUserService<TestProjectUserResource, TestProjectUserEntity, TestProjectEntity>
    {
        public TestProjectUserService(IJsonApiContext jsonApiContext, IMapper mapper, IUserAccessor userAccessor,
            IRepository<TestProjectEntity> projects) : base(jsonApiContext, mapper, userAccessor, projects)
        {
        }

        public override List<ProjectUserEntity> AdministratorAccessibleProjectUsers(string adminUserId)
        {
            return new List<ProjectUserEntity>()
                {
                    new TestProjectUserEntity()
                        {
                            UserRef = "user01"
                        }
                 };
        }
    }
}
