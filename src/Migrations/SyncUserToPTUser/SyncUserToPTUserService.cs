using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.ExceptionServices;
using System.Threading.Tasks;
using Autofac;
using MongoDB.Driver;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace SyncUserToPTUser
{
    /// <summary> Code to move sync users to the sf-project model. </summary>
    public class SyncUserToPTUserService : ISyncUserToPTUserService
    {
        private readonly IRealtimeService _realtimeService;
        private readonly IParatextService _paratextService;
        private readonly IRepository<SFProjectSecret> _projectSecretRepo;
        private IConnection _realtimeServiceConnection;

        private readonly IProgramLogger _logger;

        public SyncUserToPTUserService(IRealtimeService realtimeService, IParatextService paratextService,
            IRepository<SFProjectSecret> projectSecretRepo, IProgramLogger logger)
        {
            _realtimeService = realtimeService;
            _paratextService = paratextService;
            _projectSecretRepo = projectSecretRepo;
            _logger = logger;
        }

        /// <summary> Move sync users to the SF project model. </summary>
        public async Task MoveSyncUsersToProject(bool dryRun, ISet<string> sfProjectIdsToUpdate = null)
        {
            List<SFProject> sfProjects = _realtimeService.QuerySnapshots<SFProject>().ToList<SFProject>();
            if (sfProjectIdsToUpdate != null)
            {
                sfProjects = sfProjects.Where((SFProject p) => sfProjectIdsToUpdate.Contains(p.Id)).ToList();
                string ids = string.Join(' ', sfProjects.Select((SFProject sfProject) => sfProject.Id));
                int count = sfProjects.Count;
                _logger.Log($"Only working on the subset of projects (count {count}) with these SF project ids: {ids}");
            }
            _realtimeServiceConnection = await _realtimeService.ConnectAsync();

            _logger.Log($"{Program.Bullet1} Report on projects to move sync users:");
            foreach (SFProject sfProject in sfProjects)
            {
                try
                {
                    IDocument<SFProject> projectDoc = await _realtimeServiceConnection.FetchAsync<SFProject>(sfProject.Id);
                    if (!(await _projectSecretRepo.TryGetAsync(sfProject.Id)).TryResult(out SFProjectSecret projectSecret))
                    {
                        _logger.Log($"Could not find project secret for project {sfProject.Id}.");
                        continue;
                    }
                    if (dryRun)
                    {
                        int syncUserCount = projectSecret.SyncUsers.Count;
                        _logger.Log($"  {Program.Bullet2} Dry Run Mode: Expected to move {syncUserCount} sync users on project: {sfProject.Id}");
                        continue;
                    }
                    List<ParatextUserProfile> ptUsers = new List<ParatextUserProfile>();
                    await projectDoc.SubmitJson0OpAsync(op =>
                    {
                        if (projectSecret.SyncUsers != null)
                        {
                            foreach (SyncUser syncUser in projectSecret.SyncUsers)
                            {
                                var paratextUser = new ParatextUserProfile
                                {
                                    Username = syncUser.ParatextUsername,
                                    OpaqueUserId = syncUser.Id,
                                };
                                ptUsers.Add(paratextUser);
                            }
                        }
                        if (projectDoc.Data.ParatextUsers == null)
                            op.Set(pd => pd.ParatextUsers, ptUsers);
                    });
                    await _projectSecretRepo.UpdateAsync(projectSecret.Id, u =>
                    {
                        u.Unset(projectSecret => projectSecret.SyncUsers);
                    });
                    _logger.Log($"  {Program.Bullet2} Sync users moved to SF project {sfProject.Name} {sfProject.Id}.");
                }
                catch (Exception e)
                {
                    // We probably won't get here. But just in case.
                    _logger.Log($"  {Program.Bullet2} There was a problem moving sync users - projectId: {sfProject.Id}");
                    _logger.Log($"  {Program.Bullet2} Exception was {e.Message}");
                }
            }
            _realtimeServiceConnection?.Dispose();
        }
    }
}
