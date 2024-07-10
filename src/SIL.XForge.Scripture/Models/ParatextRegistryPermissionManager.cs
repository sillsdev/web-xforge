using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A wrapper for PermissionManager that we can override the default user for.
/// </summary>
/// <remarks>
/// This is for use with PermissionManagers returned from the Paratext Registry, as the default user for those instances
/// will be the user that has that Paratext license for the computer, as opposed to PermissionManagers from ScrText
/// objects which have the default user set to the Paratext user who is opening the project.
/// </remarks>
public class ParatextRegistryPermissionManager : PermissionManager
{
    /// <summary>
    /// Initializes a new instance of the <see cref="ParatextRegistryPermissionManager" /> class.
    /// </summary>
    /// <param name="userName">The Paratext username.</param>
    /// <remarks>
    /// This constructor is when you want to construct a new permission set that is not on disk.
    /// </remarks>
    public ParatextRegistryPermissionManager(string userName) => DefaultUser = userName;

    /// <summary>
    /// Initializes a new instance of the <see cref="ParatextRegistryPermissionManager" /> class.
    /// </summary>
    /// <param name="userName">The Paratext username.</param>
    /// <param name="permissionManager">The existing permission manager,</param>
    /// <remarks>
    /// This constructor is when you want to use an existing set of permissions.
    /// </remarks>
    public ParatextRegistryPermissionManager(string userName, PermissionManager permissionManager)
    {
        UpdateData(permissionManager);
        DefaultUser = userName;
    }

    /// <summary>
    /// Gets or sets the default username.
    /// </summary>
    /// <remarks>
    /// This is the default username used by paratext for calculating permissions or access.
    /// </remarks>
    protected override string DefaultUser { get; }
}
