using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class SFProjectRights : ISFProjectRights
{
    internal static readonly string Filename = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "rightsByRole.json");
    private readonly Dictionary<string, string[]> _rights = [];

    public SFProjectRights(IFileSystemService fileSystemService)
    {
        string json = fileSystemService.FileReadText(Filename);
        var rightsByRole = JsonConvert.DeserializeObject<Dictionary<string, Dictionary<string, string[]>>>(json);
        foreach ((string role, Dictionary<string, string[]> rights) in rightsByRole)
        {
            AddRights(role, rights.SelectMany(kvp => kvp.Value.Select(operation => (kvp.Key, operation))));
        }
    }

    public static string JoinRight(string domain, string operation) => domain + '.' + operation;

    /// <summary>
    /// Determines if a user has the specified right for the specific project.
    /// </summary>
    /// <param name="project">The project.</param>
    /// <param name="userId">The user identifier.</param>
    /// <param name="projectDomain">The project domain. A constant from <see cref="SFProjectDomain"/>.</param>
    /// <param name="operation">The operation. A constant from <see cref="Operation"/>.</param>\
    /// <param name="data">(optional) The data object the operation is to be performed on.</param>
    /// <returns><c>true</c> if the role generally has the right to do something; otherwise, <c>false</c>.</returns>
    public bool HasRight(
        Project project,
        string? userId,
        string projectDomain,
        string operation,
        IOwnedData? data = null
    )
    {
        // Ensure that the user has a role
        if (userId == null || !project.UserRoles.TryGetValue(userId, out string userRole))
        {
            return false;
        }

        string[] rights =
        [
            .. _rights.GetValueOrDefault(userRole) ?? [],
            .. project.UserPermissions.GetValueOrDefault(userId) ?? [],
            .. project.RolePermissions.GetValueOrDefault(userRole) ?? [],
        ];

        if (rights.Contains(JoinRight(projectDomain, operation)))
        {
            return operation != Operation.Create || data == null || data.OwnerRef == userId;
        }

        string ownOperation;
        switch (operation)
        {
            case Operation.Delete:
                ownOperation = Operation.DeleteOwn;
                break;
            case Operation.Edit:
                ownOperation = Operation.EditOwn;
                break;
            case Operation.View:
                ownOperation = Operation.ViewOwn;
                break;
            default:
                return false;
        }

        return data?.OwnerRef == userId && rights.Contains(JoinRight(projectDomain, ownOperation));
    }

    /// <summary>
    /// Checks if a role has a right to perform an operation in the specified project domain.
    /// This is different to the implementation in the RealtimeServer, as this checks the project's role permissions.
    /// </summary>
    /// <param name="project">The project.</param>
    /// <param name="role">The role. A constant from <see cref="SFProjectRole"/>.</param>
    /// <param name="projectDomain">The project domain. A constant from <see cref="SFProjectDomain"/>.</param>
    /// <param name="operation">The operation. A constant from <see cref="Operation"/>.</param>
    /// <returns><c>true</c> if the role generally has the right to do something; otherwise, <c>false</c>.</returns>
    public bool RoleHasRight(Project project, string role, string projectDomain, string operation)
    {
        string[] rights =
        [
            .. _rights.GetValueOrDefault(role) ?? [],
            .. project.RolePermissions.GetValueOrDefault(role) ?? [],
        ];
        return rights.Contains(JoinRight(projectDomain, operation));
    }

    private void AddRights(string role, IEnumerable<(string, string)> rights) =>
        _rights.Add(role, [.. rights.Select(r => JoinRight(r.Item1, r.Item2))]);
}
