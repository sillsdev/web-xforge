using System.IdentityModel.Tokens.Jwt;
using System.Runtime.ExceptionServices;
using System.Security.Claims;
using MongoDB.Bson;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace BackoutCommits;

/// <summary>
/// Code to sync all projects.
/// </summary>
public class SyncAllService : ISyncAllService
{
    private readonly Func<IParatextSyncRunner> _syncRunnerFactory;
    private readonly IParatextService _paratextService;
    private readonly IRepository<UserSecret> _userSecretRepo;
    private readonly IRepository<SyncMetrics> _syncMetricsRepo;
    private readonly ISFProjectTool _sfProjectTool;

    private readonly IProgramLogger _logger;
    private readonly IHgWrapper _hgWrapper;

    public SyncAllService(
        Func<IParatextSyncRunner> syncRunnerFactory,
        IParatextService paratextService,
        IRepository<UserSecret> userSecretRepo,
        IRepository<SyncMetrics> syncMetricsRepo,
        ISFProjectTool sfProjectTool,
        IHgWrapper hgWrapper,
        IProgramLogger logger
    )
    {
        _syncRunnerFactory = syncRunnerFactory;
        _paratextService = paratextService;
        _userSecretRepo = userSecretRepo;
        _syncMetricsRepo = syncMetricsRepo;
        _sfProjectTool = sfProjectTool;
        _hgWrapper = hgWrapper;
        _logger = logger;
    }

    /// <summary>
    /// Synchronize SF projects to the Paratext. In addition to
    /// reporting information on projects and whether there is an admin that can sync the project, this method shows
    /// that the admin can successfully perform queries to both the PT Registry and the PT Data Access web APIs, via
    /// various ParatextService method calls.
    /// If `doSynchronizations` is false, only do the above reporting. If true, also synchronize the SF DB with
    /// Paratext.
    /// </summary>
    public async Task SynchronizeAllProjectsAsync(
        bool doSynchronizations,
        ISet<string> sfProjectIdsToSynchronize,
        string projectRootDir,
        IDictionary<string, string> sfAdminsToUse = null
    )
    {
        List<SFProject> allSfProjects = _sfProjectTool.GetProjectSnapshots();
        allSfProjects.RemoveAll((SFProject sfProject) => !sfProjectIdsToSynchronize.Contains(sfProject.Id));
        string ids = string.Join(' ', allSfProjects.Select((SFProject sfProject) => sfProject.Id));
        int count = allSfProjects.Count;
        List<Task> syncTasks = new List<Task>();

        // Report on all SF projects.
        foreach (SFProject sfProject in allSfProjects)
        {
            _logger.Log(
                $"> PT project {sfProject.ShortName}, "
                    + $"PT project id {sfProject.ParatextId}, SF project id {sfProject.Id}."
            );
            List<string> projectSfAdminUserIds = sfProject
                .UserRoles.Where(ur => ur.Value == SFProjectRole.Administrator)
                .Select(ur => ur.Key)
                .ToList<string>();
            if (projectSfAdminUserIds.Count < 1)
            {
                List<string> projectSfUserIds = sfProject.UserRoles.Select(ur => ur.Key).ToList<string>();
                string users = string.Join(", ", projectSfUserIds);
                if (projectSfUserIds.Count < 1)
                {
                    users = "None";
                }
                _logger.Log($"  > Warning: no admin users. Non-admin users include: {users}");
            }

            // Report on all admins in a project
            foreach (string sfUserId in projectSfAdminUserIds)
            {
                UserSecret userSecret = _userSecretRepo.Query().FirstOrDefault((UserSecret us) => us.Id == sfUserId);
                string ptUsername = null;
                string ptUserId = null;
                try
                {
                    ptUsername = _paratextService.GetParatextUsername(userSecret);
                    ptUserId = GetParatextUserId(userSecret);
                }
                catch (Exception e)
                {
                    _logger.Log(
                        $"  > Failure getting SF user's PT username or PT user id. "
                            + $"Skipping. SF user id was {sfUserId}. If known, PT username was {ptUsername}. "
                            + $"Error with stack was {e}"
                    );
                    continue;
                }
                _logger.Log(
                    $"  > PT user '{ptUsername}', " + $"id {ptUserId}, using SF admin user id {sfUserId} on SF project."
                );

                string rt = $"{userSecret.ParatextTokens.RefreshToken[..5]}..";
                string at = $"{userSecret.ParatextTokens.AccessToken[..5]}..";
                bool atv = userSecret.ParatextTokens.ValidateLifetime();
                _logger.Log(
                    $"    > Paratext RefreshToken: {rt}, " + $"AccessToken: {at}, AccessToken initially valid: {atv}."
                );

                // Demonstrate access to PT Registry, and report Registry's statement of role.
                _logger.Log($"    > PT Registry report on role on PT project: ", false);
                IReadOnlyDictionary<string, string> ptProjectRoles = null;
                try
                {
                    ptProjectRoles = await _paratextService.GetProjectRolesAsync(
                        userSecret,
                        sfProject,
                        CancellationToken.None
                    );
                }
                catch (Exception e)
                {
                    Console.WriteLine(
                        $"      Failure fetching user's PT project roles. Skipping. " + $"Error was {e.Message}"
                    );
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
                    userPtProjects = await _paratextService.GetProjectsAsync(userSecret);
                }
                catch (Exception e)
                {
                    _logger.Log($"    > Failure fetching user's PT projects. Skipping. " + $"Error was {e.Message}");
                    continue;
                }

                _logger.Log(
                    $"    > PT Data Access and PT Registry "
                        + "based report on projects the user can access, narrowed to this project: ",
                    false
                );
                List<string> ptProjectNamesList = userPtProjects
                    .Where(ptProject => ptProject.ParatextId == sfProject.ParatextId)
                    .Select(ptProject => ptProject.ShortName)
                    .ToList();
                string ptProjectNames = string.Join(',', ptProjectNamesList);
                if (ptProjectNamesList.Count < 1)
                {
                    ptProjectNames =
                        $"User is not on this project. "
                        + $"PT reports they are on this many PT projects: {userPtProjects.Count}";
                }
                Console.WriteLine(ptProjectNames);

                if (doSynchronizations)
                {
                    if (sfAdminsToUse != null && sfAdminsToUse.ContainsKey(sfProject.Id))
                    {
                        sfAdminsToUse.TryGetValue(sfProject.Id, out string sfAdminIdToUse);
                        bool isUserAtHand = sfUserId == sfAdminIdToUse;
                        if (isUserAtHand)
                        {
                            _logger.Log(
                                $"  > For SF Project {sfProject.Id}, we were asked to use "
                                    + $"this SF user {sfUserId} to sync."
                            );
                        }
                        else
                        {
                            _logger.Log(
                                $"  > For SF Project {sfProject.Id}, we were asked to use "
                                    + $"SF user {sfAdminIdToUse}, not {sfUserId}, to sync. So skipping this user."
                            );
                            continue;
                        }
                    }

                    try
                    {
                        _logger.Log(
                            $"  > Starting an asynchronous synchronization for "
                                + $"SF project {sfProject.Id} as SF user {sfUserId}."
                        );
                        Task syncTask = SynchronizeProjectAsync(sfUserId, sfProject.Id);
                        IDocument<SFProject> projectDoc = await _sfProjectTool.GetProjectDocAsync(sfProject.Id);
                        // Increment the queued count (such as done in SyncService), since it gets decremented
                        // later by ParatextSyncRunner.
                        await _sfProjectTool.IncrementProjectQueuedCountAsync(projectDoc);
                        _logger.Log(
                            $"    > Synchronization task for SF project {sfProject.Id} as "
                                + $"SF user {sfUserId} has Sync Task Id {syncTask.Id}."
                        );
                        syncTasks.Add(syncTask);
                        break;
                    }
                    catch (Exception e)
                    {
                        // We probably won't get here. But just in case.
                        _logger.Log(
                            $"    > There was a problem with synchronizing. It might be "
                                + $"tried next with another admin user. Exception is:{Environment.NewLine}{e}"
                        );
                    }
                }
            }
        }

        if (doSynchronizations)
        {
            _logger.Log(
                "Waiting for synchronization tasks to finish (if any). "
                    + $"There are this many tasks: {syncTasks.Count}"
            );
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
                _logger.Log("Synchronization tasks are finished.");
            }
            catch (AggregateException e)
            {
                _logger.Log(
                    "There was a problem with one or more synchronization tasks. "
                        + $"Exception is:{Environment.NewLine}{e}"
                );
            }

            if (syncTasks.Any(task => !task.IsCompletedSuccessfully))
            {
                _logger.Log("One or more sync tasks did not complete successfully.");
            }
            else
            {
                _logger.Log("All sync tasks finished with a claimed Task status of Completed Successfully.");
            }

            _logger.Log($"> Sync task completion results:");
            foreach (Task task in syncTasks)
            {
                string exceptionInfo = $"with exception {task.Exception?.InnerException}.";
                if (task.Exception == null)
                {
                    exceptionInfo = "with no unhandled exception thrown.";
                }
                _logger.Log($"  > Sync task Id {task.Id} has status {task.Status} {exceptionInfo}");
                if (task.Exception?.InnerExceptions?.Count > 1)
                {
                    _logger.Log(
                        $"    > Sync task Id {task.Id} has more than one inner exception. "
                            + "Sorry if this is redundant, but they are:"
                    );
                    foreach (var e in task.Exception.InnerExceptions)
                    {
                        _logger.Log($"    > Inner exception: {e}");
                    }
                }
            }
        }

        allSfProjects = _sfProjectTool.GetProjectSnapshots();
        allSfProjects.RemoveAll((SFProject sfProject) => !sfProjectIdsToSynchronize.Contains(sfProject.Id));
        ReportLastSyncSuccesses(allSfProjects);
        if (doSynchronizations)
            await CleanupProjectsAsync(allSfProjects, projectRootDir);
    }

    /// <summary>
    /// Synchronize project between SF DB and Paratext Data Access server.
    /// </summary>
    public async Task SynchronizeProjectAsync(string sfUserId, string sfProjectId)
    {
        var targetSyncMetrics = new SyncMetrics
        {
            DateQueued = DateTime.UtcNow,
            Id = ObjectId.GenerateNewId().ToString(),
            ProjectRef = sfProjectId,
            Status = SyncStatus.Queued,
            UserRef = sfUserId,
        };
        await _syncMetricsRepo.InsertAsync(targetSyncMetrics);
        var syncRunner = _syncRunnerFactory();
        await syncRunner.RunAsync(sfProjectId, sfUserId, targetSyncMetrics.Id, false, CancellationToken.None);
    }

    /// <summary>
    /// Report on project sync successes from mongo project doc sync data.
    /// Note that as implemented, this seems to report out of date information, so running a second time can be
    /// needed to see an up-to-date report.
    /// </summary>
    private void ReportLastSyncSuccesses(List<SFProject> sfProjects)
    {
        _logger.Log($"> SF projects have the following last sync dates and results.");
        bool anyFailures = sfProjects.Any((SFProject sfProject) => sfProject.Sync.LastSyncSuccessful != true);
        _logger.Log(
            $"  > One or more SF projects are noted as having failed the last sync "
                + $"(this would be bad): {anyFailures}"
        );
        DateTime yesterday = DateTime.Now.ToUniversalTime().AddDays(-1);
        bool anyDidNotSyncToday = sfProjects.Any(
            (SFProject sfProject) => sfProject.Sync.DateLastSuccessfulSync < yesterday
        );
        _logger.Log(
            $"  > One or more SF projects have not successfully synchronized in "
                + $"the last day (this would be bad): {anyDidNotSyncToday}"
        );
        foreach (SFProject sfProject in sfProjects)
        {
            _logger.Log(
                $"  > SF Project id {sfProject.Id}: "
                    + $"DateLastSuccessfulSync: {sfProject.Sync.DateLastSuccessfulSync?.ToString("o")}. "
                    + $"LastSyncSuccessful: {sfProject.Sync.LastSyncSuccessful}."
            );
        }
    }

    private async Task CleanupProjectsAsync(IEnumerable<SFProject> projects, string projectRootDir)
    {
        IEnumerable<SFProject> projectsWithSyncQueued = projects.Where(
            (SFProject sfProject) => sfProject.Sync.QueuedCount > 0
        );
        foreach (SFProject sfProject in projectsWithSyncQueued)
        {
            _logger.Log(
                $"  > SF project {sfProject.Id} has a sync queued count of {sfProject.Sync.QueuedCount}. Setting to 0."
            );
            IDocument<SFProject> projectDoc = await _sfProjectTool.GetProjectDocAsync(sfProject.Id);
            await _sfProjectTool.ResetProjectQueuedCountAsync(projectDoc, 0);
        }

        foreach (SFProject project in projects)
        {
            string projectPath = Path.Join(projectRootDir, project.ParatextId, "target");
            string repoRevision = _hgWrapper.GetRepoRevision(projectPath);
            if (repoRevision != project.Sync.SyncedToRepositoryVersion)
            {
                _logger.Log(
                    $"  > SF project {project.Id} has a repo revision of {repoRevision}. "
                        + $"Setting SyncedToRepositoryVersion to {repoRevision}."
                );
                // The SyncedToRepositoryVersion was set to the revision after running the backout tool
                // and if a sync failed, a backup repo may have been restored, so we need to reset the
                // repo version
                IDocument<SFProject> projectDoc = await _sfProjectTool.GetProjectDocAsync(project.Id);
                await _sfProjectTool.UpdateProjectRepositoryVersionAsync(projectDoc, repoRevision);
            }
        }
    }

    /// <summary>
    /// As claimed by tokens in userSecret. Looks like it corresponds to `userId` in PT Registry project members
    /// query.
    /// </summary>
    private static string GetParatextUserId(UserSecret userSecret)
    {
        if (userSecret.ParatextTokens == null)
            return null;
        var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
        Claim claim = accessToken.Claims.FirstOrDefault(c => c.Type == "sub");
        return claim?.Value;
    }
}
