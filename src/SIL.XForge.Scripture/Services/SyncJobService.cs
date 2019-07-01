using System.Threading.Tasks;
using AutoMapper;
using JsonApiDotNetCore.Services;
using SIL.XForge.DataAccess;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public class SyncJobService : SFProjectDataService<SyncJobResource, SyncJobEntity>
    {
        private readonly SyncJobManager _syncJobManager;
        public SyncJobService(IJsonApiContext jsonApiContext, IMapper mapper, IUserAccessor userAccessor,
            IRepository<SyncJobEntity> jobs, IRepository<SFProjectEntity> projects, SyncJobManager syncJobManager)
            : base(jsonApiContext, mapper, userAccessor, jobs, projects)
        {
            _syncJobManager = syncJobManager;
        }

        protected override int Domain => SFDomain.SyncJobs;

        protected override async Task<SyncJobEntity> InsertEntityAsync(SyncJobEntity entity)
        {
            await _syncJobManager.StartAsync(entity, false);
            return await Entities.GetAsync(entity.Id);
        }

        protected override Task<bool> DeleteEntityAsync(string id)
        {
            return _syncJobManager.CancelAsync(id);
        }
    }
}
