using System.Collections.Generic;

namespace SIL.XForge.Models;

public abstract class Project : Json0Snapshot
{
    /// <summary>
    /// The project name.
    /// </summary>
    public string Name { get; set; }

    /// <summary>
    /// Per-role permissions, where the key is the role and values are the individual permissions.
    /// </summary>
    public Dictionary<string, string[]> RolePermissions { get; set; } = [];

    /// <summary>
    /// The role for each user, where the key is the user identifier, and the value is the role.
    /// </summary>
    public Dictionary<string, string> UserRoles { get; set; } = [];

    /// <summary>
    /// Per-user permissions, where the key is the user and values are the individual permissions.
    /// </summary>
    public Dictionary<string, string[]> UserPermissions { get; set; } = [];

    /// <summary>
    /// Whether synchronization is disabled for the project.
    /// </summary>
    public bool SyncDisabled { get; set; }
}
