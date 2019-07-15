using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using JsonApiDotNetCore.Internal;
using JsonApiDotNetCore.Services;
using Microsoft.AspNetCore.Http;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    public class SFProjectUserService : ProjectUserService<SFProjectUserResource, SFProjectUserEntity, SFProjectEntity>
    {
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IParatextService _paratextService;

        public SFProjectUserService(IJsonApiContext jsonApiContext, IMapper mapper, IUserAccessor userAccessor,
            IRepository<SFProjectEntity> projects, IRepository<UserSecret> userSecrets,
            IParatextService paratextService) : base(jsonApiContext, mapper, userAccessor, projects)
        {
            _userSecrets = userSecrets;
            _paratextService = paratextService;
        }

        protected override string ProjectAdministratorRole => SFProjectRoles.Administrator;

        protected override async Task<SFProjectUserEntity> InsertEntityAsync(SFProjectUserEntity entity)
        {
            if (SystemRole == SystemRoles.User || entity.Role == null)
            {
                // get role from Paratext project
                string paratextId = await Projects.Query().Where(p => p.Id == entity.ProjectRef)
                    .Select(p => p.ParatextId).SingleOrDefaultAsync();
                if (paratextId == null)
                {
                    throw new JsonApiException(StatusCodes.Status400BadRequest,
                        "The specified project could not be found.");
                }
                UserSecret userSecret = await _userSecrets.GetAsync(UserId);
                Attempt<string> attempt = await _paratextService.TryGetProjectRoleAsync(userSecret, paratextId);
                if (attempt.TryResult(out string role))
                    entity.Role = role;
                else
                    entity.Role = SFProjectRoles.SFReviewer;
            }

            return await base.InsertEntityAsync(entity);
        }
    }
}
