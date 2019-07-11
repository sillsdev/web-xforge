using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public class TestProjectService : IProjectAdminFilter<ProjectEntity>
    {
        public List<ProjectUserEntity> AdministratorAccessibleProjectUsers(string adminUserId)
        {
            return new List<ProjectUserEntity>()
                {
                    new TestProjectUserEntity()
                        {
                            Id = "projectuser01",
                            UserRef = "user01"
                        }
                };
        }
    }
}
