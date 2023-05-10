using Microsoft.FeatureManagement;
using SIL.ObjectModel;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace ServalMigration;

/// <summary>
/// Migrates all projects to Serval, if translation is enabled.
/// </summary>
public class ServalMigrator : DisposableBase
{
    /// <summary>
    /// The feature manager.
    /// </summary>
    private readonly IFeatureManager _featureManager;

    /// <summary>
    /// The HTTP client to test if Serval is accessible.
    /// </summary>
    private readonly HttpClient _httpClient;

    /// <summary>
    /// The Machine project service.
    /// </summary>
    private readonly IMachineProjectService _machineProjectService;

    /// <summary>
    /// The project secrets repository.
    /// </summary>
    private readonly IRepository<SFProjectSecret> _projectSecrets;

    /// <summary>
    /// The realtime service.
    /// </summary>
    private readonly IRealtimeService _realtimeService;

    /// <summary>
    /// Initializes a new instance of the <see cref="ServalMigrator" /> class.
    /// </summary>
    /// <param name="featureManager">The feature manager.</param>
    /// <param name="httpClientFactory">The HTTP client factory.</param>
    /// <param name="machineProjectService">The Machine project service.</param>
    /// <param name="projectSecrets">The SF project secrets repository.</param>
    /// <param name="realtimeService">The realtime service.</param>
    public ServalMigrator(
        IFeatureManager featureManager,
        IHttpClientFactory httpClientFactory,
        IMachineProjectService machineProjectService,
        IRepository<SFProjectSecret> projectSecrets,
        IRealtimeService realtimeService
    )
    {
        _featureManager = featureManager;
        _httpClient = httpClientFactory.CreateClient(MachineApi.HttpClientName);
        _machineProjectService = machineProjectService;
        _projectSecrets = projectSecrets;
        _realtimeService = realtimeService;
    }

    public async Task<bool> MigrateAllProjectsAsync(
        bool doWrite,
        ICollection<string> sfProjectIdsToMigrate,
        IDictionary<string, string> sfAdminsToUse,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the feature flags are set correctly
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.Serval))
        {
            Program.Log("ERROR: Cannot proceed. The Serval feature flag is disabled.");
            return false;
        }

        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            Program.Log("ERROR: Cannot proceed. The In-Process Machine feature flag is enabled.");
            return false;
        }

        // Validate that Serval is accessible
        if (!await IsServalAccessible(cancellationToken))
        {
            Program.Log("ERROR: Cannot proceed. Serval is not accessible.");
            return false;
        }

        // Get all projects that have translation suggestions enabled, and are not configured for Serval
        List<SFProject> projects = await _realtimeService
            .QuerySnapshots<SFProject>()
            .Where(p => p.TranslateConfig.TranslationSuggestionsEnabled)
            .ToListAsync();

        // If we are only to migrate some projects, restrict this list to them
        if (sfProjectIdsToMigrate.Any())
        {
            projects.RemoveAll(p => !sfProjectIdsToMigrate.Contains(p.Id));
            string ids = string.Join(' ', projects.Select(p => p.Id));
            int count = projects.Count;
            Program.Log($"Only working on the subset of projects (count {count}) with these SF project ids: {ids}");
        }

        // Get all of the project secrets that are not configured for Serval
        List<SFProjectSecret> projectSecrets = await _projectSecrets
            .Query()
            .Where(p => p.ServalData == null || string.IsNullOrEmpty(p.ServalData!.TranslationEngineId))
            .ToListAsync();

        // Iterate over each project that is not configured for Serval
        foreach (var project in projects.Where(p => projectSecrets.Select(ps => ps.Id).Contains(p.Id)))
        {
            Program.Log($"Migrating Project {project.Id}: {project.Name}");

            // Get the admin users
            List<string> projectSfAdminUserIds = project.UserRoles
                .Where(ur => ur.Value == SFProjectRole.Administrator)
                .Select(ur => ur.Key)
                .ToList();
            if (!projectSfAdminUserIds.Any())
            {
                List<string> projectSfUserIds = project.UserRoles.Select(ur => ur.Key).ToList();
                string users = projectSfUserIds.Any() ? string.Join(", ", projectSfUserIds) : "None";
                Program.Log($"Warning: No admin users. Non-admin users include: {users}");
            }

            // Use the first admin in the project we are permitted to use
            foreach (string sfUserId in projectSfAdminUserIds)
            {
                // If we are told to use specific admins, ensure they are used
                if (sfAdminsToUse.ContainsKey(project.Id))
                {
                    sfAdminsToUse.TryGetValue(project.Id, out string? sfAdminIdToUse);
                    if (sfUserId == sfAdminIdToUse)
                    {
                        Program.Log(
                            $"For SF Project {project.Id}, we were asked to use this SF user {sfUserId} to migrate."
                        );
                    }
                    else
                    {
                        Program.Log(
                            $"For SF Project {project.Id}, we were asked to use SF user {sfAdminIdToUse}, "
                                + $"not {sfUserId}, to migrate. So skipping this user."
                        );
                        continue;
                    }
                }

                // Add the project to Serval, and build it
                // If the writing system tag is not set for the target or source, BuildProjectAsync will fix that
                if (doWrite)
                {
                    Program.Log("Adding project to Serval...");
                    await _machineProjectService.AddProjectAsync(sfUserId, project.Id, cancellationToken);
                    Program.Log("Initiating first build...");
                    await _machineProjectService.BuildProjectAsync(sfUserId, project.Id, cancellationToken);
                }
                else
                {
                    Program.Log("Project not migrated to Serval, as test mode enabled.");
                }

                // We do not need to iterate any longer (the continue statements above ensure the correct user is used)
                break;
            }
        }

        return true;
    }

    /// <summary>
    /// Disposes managed resources.
    /// </summary>
    protected override void DisposeManagedResources() => _httpClient.Dispose();

    /// <summary>
    /// Checks if Serval returns a valid response
    /// </summary>
    /// <param name="cancellationToken">The cancellation token</param>
    /// <returns><c>true</c> if Serval was successfully accessed; otherwise <c>false</c>.</returns>
    private async Task<bool> IsServalAccessible(CancellationToken cancellationToken)
    {
        Program.Log("Checking if Serval is accessible...");
        try
        {
            using var response = await _httpClient.GetAsync(
                "api/v1/translation/engines/",
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken
            );
            return response.IsSuccessStatusCode;
        }
        catch (Exception e)
        {
            Program.Log(e.ToString());
            return false;
        }
    }
}
