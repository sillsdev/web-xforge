using System.Linq;
using System.Threading.Tasks;
using Hangfire;
using SIL.XForge.DataAccess;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class SyncJobManager
    {
        private readonly IRepository<SyncJobEntity> _jobs;
        private readonly IRepository<SFProjectEntity> _projects;
        private readonly IBackgroundJobClient _backgroundJobClient;

        public SyncJobManager(IRepository<SyncJobEntity> jobs, IRepository<SFProjectEntity> projects,
            IBackgroundJobClient backgroundJobClient)
        {
            _jobs = jobs;
            _projects = projects;
            _backgroundJobClient = backgroundJobClient;
        }

        public async Task StartAsync(SyncJobEntity job, bool trainEngine)
        {
            await _jobs.InsertAsync(job);
            _backgroundJobClient.Enqueue<ParatextSyncRunner>(r => r.RunAsync(null, null, job.OwnerRef,
                job.ProjectRef, job.Id, trainEngine));
        }

        public async Task<bool> CancelAsync(string id)
        {
            SyncJobEntity job = await _jobs.Query().FirstOrDefaultAsync(
                j => j.Id == id && SyncJobEntity.ActiveStates.Contains(j.State));
            if (job != null)
            {
                _backgroundJobClient.Delete(job.BackgroundJobId);
                return true;
            }

            return false;
        }

        public async Task<bool> CancelByProjectIdAsync(string projectId)
        {
            SyncJobEntity job = await _jobs.Query().FirstOrDefaultAsync(
                j => j.ProjectRef == projectId && SyncJobEntity.ActiveStates.Contains(j.State));
            if (job != null)
            {
                _backgroundJobClient.Delete(job.BackgroundJobId);
                return true;
            }
            return false;
        }
    }
}
