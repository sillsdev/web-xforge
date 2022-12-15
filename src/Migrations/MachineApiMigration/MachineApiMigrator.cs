using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.FeatureManagement;
using Org.BouncyCastle.Crypto;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
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
    /// The Paratext service.
    /// </summary>
    private readonly IParatextService _paratextService;

    /// <summary>
    /// The project secrets repository.
    /// </summary>
    private readonly IRepository<SFProjectSecret> _projectSecrets;

    /// <summary>
    /// The project service.
    /// </summary>
    private readonly ISFProjectService _projectService;

    /// <summary>
    /// The realtime service.
    /// </summary>
    private readonly IRealtimeService _realtimeService;

    /// <summary>
    /// The user secrets repository.
    /// </summary>
    private readonly IRepository<UserSecret> _userSecrets;

    /// <summary>
    /// Initializes a new instance of the <see cref="MachineApiMigrator" /> class.
    /// </summary>
    /// <param name="machineProjectService">The Machine project service.</param>
    /// <param name="paratextService">The Paratext service.</param>
    /// <param name="projectSecrets">The SF project secrets repository.</param>
    /// <param name="projectService">The SF project service.</param>
    /// <param name="realtimeService">The realtime service.</param>
    /// <param name="userSecrets">The user secrets repository.</param>
    public MachineApiMigrator(
        IFeatureManager featureManager,
        IMachineProjectService machineProjectService,
        IParatextService paratextService,
        IRepository<SFProjectSecret> projectSecrets,
        ISFProjectService projectService,
        IRealtimeService realtimeService,
        IRepository<UserSecret> userSecrets
    )
    {
        _featureManager = featureManager;
        _machineProjectService = machineProjectService;
        _paratextService = paratextService;
        _projectSecrets = projectSecrets;
        _projectService = projectService;
        _realtimeService = realtimeService;
        _userSecrets = userSecrets;
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

            // Report on all admins in a project
            foreach (string sfUserId in projectSfAdminUserIds)
            {
                // See if we need to update the writing system tag
                // We connect to the Paratext registry for this, so we need to make sure we can access it
                if (string.IsNullOrWhiteSpace(project.WritingSystem.Tag))
                {
                    Program.Log("The writing system tag is not set, and will be updated.");

                    // Ensure we have a user secret for this user
                    UserSecret? userSecret = _userSecrets.Query().FirstOrDefault(us => us.Id == sfUserId);
                    if (userSecret is null)
                    {
                        Program.Log($"Could not retrieve user secret for SF User: {sfUserId}");
                        continue;
                    }

                    // Report on the Paratext username and id
                    string ptUsername = string.Empty;
                    string ptUserId;
                    try
                    {
                        ptUsername = _paratextService.GetParatextUsername(userSecret) ?? string.Empty;
                        ptUserId = GetParatextUserId(userSecret);
                    }
                    catch (Exception e)
                    {
                        Program.Log(
                            "Failure getting SF user's PT username or PT user id. "
                                + $"Skipping. SF user id was {sfUserId}. If known, PT username was {ptUsername}. "
                                + $"Error with stack was {e}"
                        );
                        continue;
                    }
                    Program.Log(
                        $"PT user '{ptUsername}', id {ptUserId}, using SF admin user id {sfUserId} on SF project."
                    );

                    // Display partial token details
                    string rt = $"{userSecret.ParatextTokens.RefreshToken[..5]}..";
                    string at = $"{userSecret.ParatextTokens.AccessToken[..5]}..";
                    bool atv = userSecret.ParatextTokens.ValidateLifetime();
                    Program.Log($"Paratext RefreshToken: {rt}, AccessToken: {at}, AccessToken initially valid: {atv}.");

                    // Demonstrate access to PT Registry, and report Registry's statement of role.
                    Program.Log("");
                    IReadOnlyDictionary<string, string> ptProjectRoles;
                    try
                    {
                        ptProjectRoles = await _paratextService.GetProjectRolesAsync(
                            userSecret,
                            project,
                            cancellationToken
                        );
                    }
                    catch (Exception e)
                    {
                        Program.Log($"Failure fetching user's PT project roles. Skipping. Error was {e.Message}");
                        continue;
                    }

                    // Report that the user has a role on the project
                    Program.Log(
                        ptProjectRoles.TryGetValue(ptUserId, out string? ptRole)
                            ? $"PT Registry report on role on PT project: {ptRole}"
                            : "User role not found in PT Registry."
                    );

                    // Demonstrate access to PT Data Access.
                    IReadOnlyList<ParatextProject> userPtProjects;
                    try
                    {
                        userPtProjects = await _paratextService.GetProjectsAsync(userSecret);
                    }
                    catch (Exception e)
                    {
                        Program.Log($"Failure fetching user's PT projects. Skipping. Error was {e.Message}");
                        continue;
                    }

                    // Report if the user can access a project
                    List<string> ptProjectNamesList = userPtProjects
                        .Where(ptProject => ptProject.ParatextId == project.ParatextId)
                        .Select(ptProject => ptProject.ShortName)
                        .ToList();
                    if (ptProjectNamesList.Any())
                    {
                        string ptProjectNames = string.Join(',', ptProjectNamesList);
                        Program.Log($"User can access PT Projects: {ptProjectNames}");
                    }
                    else
                    {
                        Program.Log(
                            $"User is not on this project. PT reports they are on {userPtProjects.Count} PT projects"
                        );
                    }

                    // If we are told to use specific admins, ensure they are used
                    if (sfAdminsToUse.ContainsKey(project.Id))
                    {
                        sfAdminsToUse.TryGetValue(project.Id, out string? sfAdminIdToUse);
                        bool isUserAtHand = sfUserId == sfAdminIdToUse;
                        if (isUserAtHand)
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

                    if (doWrite)
                    {
                        await _projectService.EnsureWritingSystemTagIsSetAsync(sfUserId, project.Id);
                    }
                }
                else
                {
                    Program.Log("The writing system tag does not need to be updated.");
                }

                // Add the project to the Machine API, and build it
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

    /// <summary>
    /// As claimed by tokens in userSecret. Looks like it corresponds to `userId` in PT Registry project members
    /// query.
    /// </summary>
    private static string GetParatextUserId(UserSecret userSecret)
    {
        if (userSecret.ParatextTokens is null)
            return string.Empty;
        var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
        Claim? claim = accessToken.Claims.FirstOrDefault(c => c.Type == "sub");
        return claim?.Value ?? string.Empty;
    }
}
