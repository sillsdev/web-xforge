using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Runtime.ExceptionServices;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Autofac;
using MongoDB.Driver;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace PtdaSyncAll
{
    /// <summary>
    /// Code to sync all projects.
    /// </summary>
    public class SyncAll
    {
        private IConnection RealtimeServiceConnection;

        /// <summary>
        /// First-stage migrator. Synchronize all SF projects to the Paratext Data Access server.
        /// First query information that will show whether we should be able to sync all projects. In addition to
        /// reporting information on projects and whether there is an admin that can sync the project, this method shows
        /// that the admin can successfully perform queries to both the PT Registry and the PT Data Access web APIs, via
        /// various ParatextService method calls.
        /// If `doSynchronizations` is false, only do the above reporting. If true, also synchronize the SF DB with the
        /// Paratext Data Access server.
        /// </summary>
        public async Task SynchronizeAllProjectsAsync(IWebHost webHost, bool doSynchronizations)
        {
            IRealtimeService realtimeService = webHost.Services.GetService<IRealtimeService>();
            IParatextService paratextService = webHost.Services.GetService<IParatextService>();
            IRepository<UserSecret> userSecretRepo = webHost.Services.GetService<IRepository<UserSecret>>();
            IQueryable<SFProject> allSfProjects = realtimeService.QuerySnapshots<SFProject>();
            RealtimeServiceConnection = await realtimeService.ConnectAsync();
            List<Task> syncTasks = new List<Task>();

            // Report on all SF projects.
            foreach (SFProject sfProject in allSfProjects)
            {
                Program.Log($"{Program.Bullet1} PT project {sfProject.ShortName}, "
                    + $"PT project id {sfProject.ParatextId}, SF project id {sfProject.Id}.");
                IEnumerable<string> projectSfAdminUserIds = sfProject.UserRoles
                    .Where(ur => ur.Value == SFProjectRole.Administrator).Select(ur => ur.Key);
                if (projectSfAdminUserIds.Count() < 1)
                {
                    IEnumerable<string> projectSfUserIds = sfProject.UserRoles.Select(ur => ur.Key);
                    string users = string.Join(", ", projectSfUserIds);
                    if (projectSfUserIds.Count() < 1)
                    {
                        users = "None";
                    }
                    Program.Log($"  {Program.Bullet2} Warning: no admin users. Non-admin users include: {users}");
                }

                // Report on all admins in a project
                foreach (string sfUserId in projectSfAdminUserIds)
                {
                    UserSecret userSecret = userSecretRepo.Query().FirstOrDefault((UserSecret us) => us.Id == sfUserId);
                    string ptUsername = null;
                    string ptUserId = null;
                    try
                    {
                        ptUsername = paratextService.GetParatextUsername(userSecret);
                        ptUserId = GetParatextUserId(userSecret);
                    }
                    catch (Exception e)
                    {
                        Program.Log($"  {Program.Bullet2} Failure getting SF user's PT username or PT user id. " +
                            $"Skipping. SF user id was {sfUserId}. If known, PT username was {ptUsername}. " +
                            $"Error with stack was {e}");
                        continue;
                    }
                    Program.Log($"  {Program.Bullet2} PT user '{ptUsername}', "
                        + $"id {ptUserId}, using SF admin user id {sfUserId} on SF project.");

                    string rt = $"{userSecret.ParatextTokens.RefreshToken.Substring(0, 5)}..";
                    string at = $"{userSecret.ParatextTokens.AccessToken.Substring(0, 5)}..";
                    bool atv = userSecret.ParatextTokens.ValidateLifetime();
                    Program.Log($"    {Program.Bullet3} Paratext RefreshToken: {rt}, "
                        + $"AccessToken: {at}, AccessToken initially valid: {atv}.");

                    // Demonstrate access to PT Registry, and report Registry's statement of role.
                    Program.Log($"    {Program.Bullet3} PT Registry report on role on PT project: ", false);
                    IReadOnlyDictionary<string, string> ptProjectRoles = null;
                    try
                    {
                        ptProjectRoles = await paratextService.GetProjectRolesAsync(userSecret, sfProject.ParatextId);
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine($"      Failure fetching user's PT project roles. Skipping. " +
                            $"Error was {e.Message}");
                        continue;
                    }
                    if (ptProjectRoles.TryGetValue(ptUserId, out string ptRole))
                    {
                        Console.WriteLine($"{ptRole}");
                    }
                    else
                    {
                        Console.WriteLine($"Not found.");
                    }
                    // Demonstrate access to PT Data Access.
                    IReadOnlyList<ParatextProject> userPtProjects = null;
                    try
                    {
                        userPtProjects = await paratextService.GetProjectsAsync(userSecret);
                    }
                    catch (Exception e)
                    {
                        Program.Log($"    {Program.Bullet3} Failure fetching user's PT projects. Skipping. "
                            + $"Error was {e.Message}");
                        continue;
                    }

                    Program.Log($"    {Program.Bullet3} PT Data Access and PT Registry "
                        + "based report on projects the user can access, narrowed to this project: ", false);
                    IEnumerable<string> ptProjectNamesList = userPtProjects
                        .Where(ptProject => ptProject.ParatextId == sfProject.ParatextId)
                        .Select(ptProject => ptProject.ShortName);
                    string ptProjectNames = string.Join(',', ptProjectNamesList);
                    if (ptProjectNamesList.Count() < 1)
                    {
                        ptProjectNames = $"User is not on this project. " +
                            $"PT reports they are on this many PT projects: {userPtProjects.Count()}";
                    }
                    Console.WriteLine(ptProjectNames);

                    if (doSynchronizations)
                    {
                        try
                        {
                            Program.Log($"  {Program.Bullet2} Starting an asynchronous synchronization for "
                                + $"SF project {sfProject.Id} as SF user {sfUserId}.");
                            Task syncTask = SynchronizeProject(webHost, sfUserId, sfProject.Id);
                            var projectDoc = await RealtimeServiceConnection.FetchAsync<SFProject>(sfProject.Id);
                            // Increment the queued count (such as done in SyncService), since it gets decremented
                            // later by ParatextSyncRunner.
                            await projectDoc.SubmitJson0OpAsync(op => op.Inc(pd => pd.Sync.QueuedCount));
                            Program.Log($"    {Program.Bullet3} Synchronization task for SF project {sfProject.Id} as "
                                + $"SF user {sfUserId} has Sync Task Id {syncTask.Id}.");
                            syncTasks.Add(syncTask);
                            break;
                        }
                        catch (Exception e)
                        {
                            // We probably won't get here. But just in case.
                            Program.Log($"    {Program.Bullet3} There was a problem with synchronizing. It might be "
                                + $"tried next with another admin user. Exception is:{Environment.NewLine}{e}");
                            continue;
                        }
                    }
                }
            }

            if (doSynchronizations)
            {
                Program.Log("Waiting for synchronization tasks to finish (if any). "
                    + $"There are this many tasks: {syncTasks.Count}");
                try
                {
                    Task allTasks = Task.WhenAll(syncTasks);
                    try
                    {
                        await allTasks.ConfigureAwait(false);
                    }
                    catch
                    {
                        if (allTasks.Exception == null)
                        {
                            throw;
                        }
                        ExceptionDispatchInfo.Capture(allTasks.Exception).Throw();
                    }
                    Program.Log("Synchronization tasks are finished.");
                }
                catch (AggregateException e)
                {
                    Program.Log("There was a problem with one or more synchronization tasks. "
                        + $"Exception is:{Environment.NewLine}{e}");
                }

                if (syncTasks.Any(task => !task.IsCompletedSuccessfully))
                {
                    Program.Log("One or more sync tasks did not complete successfully.");
                }
                else
                {
                    Program.Log("All sync tasks finished with a claimed Task status of Completed Successfully.");
                }

                Program.Log($"{Program.Bullet1} Sync task completion results:");
                foreach (Task task in syncTasks)
                {
                    string exceptionInfo = $"with exception {task.Exception?.InnerException}.";
                    if (task.Exception == null)
                    {
                        exceptionInfo = "with no unhandled exception thrown.";
                    }
                    Program.Log($"  {Program.Bullet2} Sync task Id {task.Id} has status {task.Status} {exceptionInfo}");
                    if (task.Exception?.InnerExceptions?.Count > 1)
                    {
                        Program.Log($"    {Program.Bullet3} Sync task Id {task.Id} has more than one inner exception. "
                            + "Sorry if this is redundant, but they are:");
                        foreach (var e in task.Exception.InnerExceptions)
                        {
                            Program.Log($"    {Program.Bullet3} Inner exception: {e}");
                        }
                    }
                }
            }

            ReportLastSyncSuccesses(allSfProjects);
        }

        /// <summary>
        /// Synchronize project between SF DB and Paratext Data Access server.
        /// </summary>
        public Task SynchronizeProject(IWebHost webHost, string sfUserId, string sfProjectId)
        {
            var syncRunner = webHost.Services.GetService<IParatextSyncRunner>();
            return syncRunner.RunAsync(sfProjectId, sfUserId, false);
        }

        /// <summary>
        /// Report on project sync successes from mongo project doc sync data.
        /// </summary>
        private void ReportLastSyncSuccesses(IEnumerable<SFProject> sfProjects)
        {
            Program.Log($"{Program.Bullet1} SF projects have the following last sync dates and results.");
            bool anyFailures = sfProjects.Any((SFProject sfProject) => sfProject.Sync.LastSyncSuccessful != true);
            Program.Log($"  {Program.Bullet2} One or more SF projects are noted as having failed the last sync "
                + $"(this would be bad): {anyFailures}");
            DateTime yesterday = DateTime.Now.ToUniversalTime().AddDays(-1);
            bool anyDidNotSyncToday = sfProjects
                .Any((SFProject sfProject) => sfProject.Sync.DateLastSuccessfulSync < yesterday);
            Program.Log($"  {Program.Bullet2} One or more SF projects have not successfully synchronized in "
                + $"the last day (this would be bad): {anyDidNotSyncToday}");
            foreach (SFProject sfProject in sfProjects)
            {
                string successOrFailure = "successful";
                if (sfProject.Sync.LastSyncSuccessful == false)
                {
                    successOrFailure = "failure";
                }
                Program.Log($"  {Program.Bullet2} SF Project id {sfProject.Id} last sync was on "
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
