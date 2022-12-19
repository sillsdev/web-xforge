using Microsoft.FeatureManagement;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;

namespace MachineApiMigration;

/// <summary>
/// Migrates all projects to the new Machine API, if translation is enabled.
/// </summary>
public class MachineApiMigrator
{
    /// <summary>
    /// The feature manager.
    /// </summary>
    private readonly IFeatureManager _featureManager;

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
    /// Initializes a new instance of the <see cref="MachineApiMigrator" /> class.
    /// </summary>
    /// <param name="featureManager">The feature manager.</param>
    /// <param name="machineProjectService">The Machine project service.</param>
    /// <param name="projectSecrets">The SF project secrets repository.</param>
    /// <param name="realtimeService">The realtime service.</param>
    public MachineApiMigrator(
        IFeatureManager featureManager,
        IMachineProjectService machineProjectService,
        IRepository<SFProjectSecret> projectSecrets,
        IRealtimeService realtimeService
    )
    {
        _featureManager = featureManager;
        _machineProjectService = machineProjectService;
        _projectSecrets = projectSecrets;
        _realtimeService = realtimeService;
    }

    public async Task MigrateAllProjectsAsync(
        bool doWrite,
        ICollection<string> sfProjectIdsToMigrate,
        IDictionary<string, string> sfAdminsToUse,
        CancellationToken cancellationToken
    )
    {
        // Ensure that the feature flags are set correctly
        if (!await _featureManager.IsEnabledAsync(FeatureFlags.MachineApi))
        {
            Program.Log("ERROR: Cannot proceed. The Machine API feature flag is disabled.");
            return;
        }

        if (await _featureManager.IsEnabledAsync(FeatureFlags.MachineInProcess))
        {
            Program.Log("ERROR: Cannot proceed. The In-Process Machine feature flag is enabled.");
            return;
        }

        // Get all projects that have translation suggestions enabled, and are not configured for the Machine API
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

        // Get all of the project secrets that are not configured for the Machine API
        List<SFProjectSecret> projectSecrets = await _projectSecrets
            .Query()
            .Where(p => p.MachineData == null || string.IsNullOrEmpty(p.MachineData!.TranslationEngineId))
            .ToListAsync();

        // Iterate over each project that is not configured for the Machine API
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

                // Add the project to the Machine API, and build it
                // If the writing system tag is not set for the target or source, BuildProjectAsync will fix that
                if (doWrite)
                {
                    Program.Log("Adding project to Machine API...");
                    await _machineProjectService.AddProjectAsync(sfUserId, project.Id, cancellationToken);
                    Program.Log("Initiating first build...");
                    await _machineProjectService.BuildProjectAsync(sfUserId, project.Id, cancellationToken);
                }
                else
                {
                    Program.Log("Project not migrated to Machine API, as test mode enabled.");
                }

                // We do not need to iterate any longer (the continue statements above ensure the correct user is used)
                break;
            }
        }
    }
}
