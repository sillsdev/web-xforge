using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Runtime.ExceptionServices;
using System.Security.Claims;
using System.Threading.Tasks;
using Autofac;
using MongoDB.Driver;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace SyncCancel
{
    /// <summary>
    /// Code to cancel sync on projects.
    /// </summary>
    public class SyncCancelService : ISyncCancelService
    {
        private readonly Func<IParatextSyncRunner> _syncRunnerFactory;
        private readonly IRealtimeService _realtimeService;
        private readonly IParatextService _paratextService;
        private readonly IRepository<UserSecret> _userSecretRepo;
        private IConnection _realtimeServiceConnection;

        private readonly IProgramLogger _logger;

        public SyncCancelService(
            Func<IParatextSyncRunner> syncRunnerFactory,
            IRealtimeService realtimeService,
            IParatextService paratextService,
            IRepository<UserSecret> userSecretRepo,
            IProgramLogger logger
        )
        {
            _syncRunnerFactory = syncRunnerFactory;
            _realtimeService = realtimeService;
            _paratextService = paratextService;
            _userSecretRepo = userSecretRepo;
            _logger = logger;
        }

        /// <summary>
        /// Cancel SF projects that are in the middle of a Synchronize.
        /// </summary>
        public async Task SynchronizeCancelProjectsAsync(ISet<string> sfProjectIdsToSynchronize = null)
        {
            List<SFProject> sfProjects = _realtimeService.QuerySnapshots<SFProject>().ToList<SFProject>();
            if (sfProjectIdsToSynchronize != null)
            {
                sfProjects.RemoveAll((SFProject sfProject) => !sfProjectIdsToSynchronize.Contains(sfProject.Id));
                string ids = string.Join(' ', sfProjects.Select((SFProject sfProject) => sfProject.Id));
                int count = sfProjects.Count;
                _logger.Log($"Only working on the subset of projects (count {count}) with these SF project ids: {ids}");
            }
            _realtimeServiceConnection = await _realtimeService.ConnectAsync();
            HashSet<SFProject> cancelledProjects = new HashSet<SFProject>();

            _logger.Log($"{Program.Bullet1} Report on projects with sync in progress:");
            foreach (SFProject sfProject in sfProjects)
            {
                try
                {
                    IDocument<SFProject> projectDoc = await _realtimeServiceConnection.FetchAsync<SFProject>(
                        sfProject.Id
                    );
                    if (projectDoc.Data.Sync.QueuedCount > 0)
                    {
                        // Clear the queued count.
                        await projectDoc.SubmitJson0OpAsync(op =>
                        {
                            op.Set(pd => pd.Sync.QueuedCount, 0);
                            op.Unset(pd => pd.Sync.PercentCompleted);
                            op.Set(pd => pd.Sync.LastSyncSuccessful, false);
                        });
                        // ToDo: we need to clear out the associated hangfire job here also - IJH 2021-05
                        // For now delete the 'sf_jobs' mongo DB (but only if you run this for ALL projects).
                        // Potentially cancel individual jobs using localhost:5000/hangfire

                        cancelledProjects.Add(sfProject);
                        _logger.Log(
                            $"  {Program.Bullet2} Synchronization cancelled for SF project {sfProject.Name} {sfProject.Id}."
                        );
                    }
                }
                catch (Exception e)
                {
                    // We probably won't get here. But just in case.
                    _logger.Log(
                        $"  {Program.Bullet2} There was a problem with cancelling sync. It might be "
                            + $"tried next with another admin user. Exception is:{Environment.NewLine}{e}"
                    );
                }
            }

            if (cancelledProjects.Count <= 0)
                _logger.Log($"  {Program.Bullet2} There where no projects with sync in progress.");

            ReportLastSyncSuccesses(cancelledProjects);
            _realtimeServiceConnection?.Dispose();
        }

        /// <summary>
        /// Report on project sync successes from mongo project doc sync data.
        /// </summary>
        private void ReportLastSyncSuccesses(HashSet<SFProject> sfProjects)
        {
            if (sfProjects.Count > 0)
                _logger.Log($"{Program.Bullet1} SF projects have the following last sync dates and results.");
            foreach (SFProject sfProject in sfProjects)
            {
                string successOrFailure = "successful";
                if (sfProject.Sync.LastSyncSuccessful == false)
                {
                    successOrFailure = "failure";
                }
                _logger.Log(
                    $"  {Program.Bullet2} SF Project id {sfProject.Id} last successful sync was on "
                        + $"{sfProject.Sync.DateLastSuccessfulSync?.ToString("o")}. Last sync was {successOrFailure}."
                );
            }
        }

        /// <summary>
        /// As claimed by tokens in userSecret. Looks like it corresponds to `userId` in PT Registry project members
        /// query.
        /// </summary>
        private string GetParatextUserId(UserSecret userSecret)
        {
            if (userSecret.ParatextTokens == null)
                return null;
            var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
            Claim claim = accessToken.Claims.FirstOrDefault(c => c.Type == "sub");
            return claim?.Value;
        }
    }
}
