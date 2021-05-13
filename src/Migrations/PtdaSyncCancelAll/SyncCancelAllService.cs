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

namespace PtdaSyncCancelAll
{
    /// <summary>
    /// Code to sync all projects.
    /// </summary>
    public class SyncCancelAllService : ISyncCancelAllService
    {
        private readonly Func<IParatextSyncRunner> _syncRunnerFactory;
        private readonly IRealtimeService _realtimeService;
        private readonly IParatextService _paratextService;
        private readonly IRepository<UserSecret> _userSecretRepo;
        private IConnection _realtimeServiceConnection;

        private readonly IProgramLogger _logger;

        public SyncCancelAllService(Func<IParatextSyncRunner> syncRunnerFactory, IRealtimeService realtimeService,
             IParatextService paratextService,
             IRepository<UserSecret> userSecretRepo, IProgramLogger logger)
        {
            _syncRunnerFactory = syncRunnerFactory;
            _realtimeService = realtimeService;
            _paratextService = paratextService;
            _userSecretRepo = userSecretRepo;
            _logger = logger;
        }

        /// <summary>
        /// Cancel all SF projects that are in the middle of a Synchronize.
        /// First query information that will show whether we should be able to cancel all syncing projects. In addition
        /// to reporting information on projects and whether there is an admin that can cancel the sync on the project.
        /// </summary>
        public async Task SynchronizeCancelAllProjectsAsync(ISet<string> sfProjectIdsToSynchronize = null)
        {
            List<SFProject> allSfProjects = _realtimeService.QuerySnapshots<SFProject>().ToList<SFProject>();
            if (sfProjectIdsToSynchronize != null)
            {
                allSfProjects.RemoveAll((SFProject sfProject) => !sfProjectIdsToSynchronize.Contains(sfProject.Id));
                string ids = string.Join(' ', allSfProjects.Select((SFProject sfProject) => sfProject.Id));
                int count = allSfProjects.Count;
                _logger.Log($"Only working on the subset of projects (count {count}) with these SF project ids: {ids}");
            }
            _realtimeServiceConnection = await _realtimeService.ConnectAsync();
            List<Task> syncTasks = new List<Task>();

            // Report on all SF projects.
            foreach (SFProject sfProject in allSfProjects)
            {
                _logger.Log($"{Program.Bullet1} PT project {sfProject.ShortName}, "
                    + $"PT project id {sfProject.ParatextId}, SF project id {sfProject.Id}.");
                List<string> projectSfAdminUserIds = sfProject.UserRoles
                    .Where(ur => ur.Value == SFProjectRole.Administrator).Select(ur => ur.Key).ToList<string>();
                if (projectSfAdminUserIds.Count() < 1)
                {
                    List<string> projectSfUserIds = sfProject.UserRoles.Select(ur => ur.Key).ToList<string>();
                    string users = string.Join(", ", projectSfUserIds);
                    if (projectSfUserIds.Count() < 1)
                    {
                        users = "None";
                    }
                    _logger.Log($"  {Program.Bullet2} Warning: no admin users. Non-admin users include: {users}");
                }

                // Report on all admins in a project
                foreach (string sfUserId in projectSfAdminUserIds)
                {
                    UserSecret userSecret = _userSecretRepo.Query()
                        .FirstOrDefault((UserSecret us) => us.Id == sfUserId);
                    string ptUsername = null;
                    string ptUserId = null;
                    try
                    {
                        ptUsername = _paratextService.GetParatextUsername(userSecret);
                        ptUserId = GetParatextUserId(userSecret);
                    }
                    catch (Exception e)
                    {
                        _logger.Log($"  {Program.Bullet2} Failure getting SF user's PT username or PT user id. " +
                            $"Skipping. SF user id was {sfUserId}. If known, PT username was {ptUsername}. " +
                            $"Error with stack was {e}");
                        continue;
                    }
                    _logger.Log($"  {Program.Bullet2} PT user '{ptUsername}', "
                        + $"id {ptUserId}, using SF admin user id {sfUserId} on SF project.");

                    string rt = $"{userSecret.ParatextTokens.RefreshToken.Substring(0, 5)}..";
                    string at = $"{userSecret.ParatextTokens.AccessToken.Substring(0, 5)}..";
                    bool atv = userSecret.ParatextTokens.ValidateLifetime();
                    _logger.Log($"    {Program.Bullet3} Paratext RefreshToken: {rt}, "
                        + $"AccessToken: {at}, AccessToken initially valid: {atv}.");

                    // Report access to PT Registry, and report Registry's statement of role.
                    _logger.Log($"    {Program.Bullet3} PT Registry report on role on PT project: ", false);
                    IReadOnlyDictionary<string, string> ptProjectRoles = null;
                    try
                    {
                        ptProjectRoles = await _paratextService.GetProjectRolesAsync(userSecret, sfProject.ParatextId);
                        if (ptProjectRoles.TryGetValue(ptUserId, out string ptRole))
                        {
                            Console.WriteLine($"{ptRole}");
                        }
                        else
                        {
                            Console.WriteLine($"Not found.");
                        }
                        // Report access to PT Data Access.
                        IReadOnlyList<ParatextProject> userPtProjects = null;
                        try
                        {
                            userPtProjects = await _paratextService.GetProjectsAsync(userSecret);
                            _logger.Log($"    {Program.Bullet3} PT Data Access and PT Registry "
                                + "based report on projects the user can access, narrowed to this project: ", false);
                            List<string> ptProjectNamesList = userPtProjects
                                .Where(ptProject => ptProject.ParatextId == sfProject.ParatextId)
                                .Select(ptProject => ptProject.ShortName).ToList();
                            string ptProjectNames = string.Join(',', ptProjectNamesList);
                            if (ptProjectNamesList.Count() < 1)
                            {
                                ptProjectNames = $"User is not on this project. " +
                                    $"PT reports they are on this many PT projects: {userPtProjects.Count()}";
                            }
                            Console.WriteLine(ptProjectNames);
                        }
                        catch (Exception e)
                        {
                            _logger.Log($"    {Program.Bullet3} Failure fetching user's PT projects. Skipping. "
                                + $"Error was {e.Message}");
                        }
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine($"      Failure fetching user's PT project roles. Skipping. " +
                            $"Error was {e.Message}");
                    }

                    try
                    {
                        IDocument<SFProject> projectDoc = await _realtimeServiceConnection.FetchAsync<SFProject>(sfProject.Id);
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
                            _logger.Log($"    {Program.Bullet3} Synchronization cancelled for SF project {sfProject.Id}.");
                        }
                        break;
                    }
                    catch (Exception e)
                    {
                        // We probably won't get here. But just in case.
                        _logger.Log($"    {Program.Bullet3} There was a problem with cancelling sync. It might be "
                            + $"tried next with another admin user. Exception is:{Environment.NewLine}{e}");
                        continue;
                    }
                }
            }

            ReportLastSyncSuccesses(allSfProjects);
        }

        /// <summary>
        /// Report on project sync successes from mongo project doc sync data.
        /// </summary>
        private void ReportLastSyncSuccesses(List<SFProject> sfProjects)
        {
            _logger.Log($"{Program.Bullet1} SF projects have the following last sync dates and results.");
            foreach (SFProject sfProject in sfProjects)
            {
                string successOrFailure = "successful";
                if (sfProject.Sync.LastSyncSuccessful == false)
                {
                    successOrFailure = "failure";
                }
                _logger.Log($"  {Program.Bullet2} SF Project id {sfProject.Id} last sync was on "
                    + $"{sfProject.Sync.DateLastSuccessfulSync?.ToString("o")} and was {successOrFailure}.");
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
