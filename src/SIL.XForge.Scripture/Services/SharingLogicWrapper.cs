using System;
using System.Collections.Generic;
using System.Linq;
using Paratext.Data.Repository;
using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Wraps access to static methods on SharingLogic with a class implementing a mockable interface.
/// </summary>
public class SharingLogicWrapper : ISharingLogicWrapper
{
    public bool ShareChanges(
        List<SharedProject> sharedProjects,
        SharedRepositorySource source,
        out List<SendReceiveResult> results,
        IList<SharedProject> reviewProjects
    )
    {
        // ShareChanges() will fail silently if the user is an Observer,
        // so throw an error if the user is an Observer in the Registry.
        if (!sharedProjects.All(s => s.Permissions.HaveRoleNotObserver))
        {
            throw new InvalidOperationException("User does not have permission to share changes.");
        }

        return SharingLogic.ShareChanges(sharedProjects, source, out results, reviewProjects);
    }

    public bool HandleErrors(Action action, bool throwExceptions = false) =>
        SharingLogic.HandleErrors(action, throwExceptions);

    public PermissionManager SearchForBestProjectUsersData(SharedRepositorySource source, SharedProject sharedProj) =>
        SharingLogic.SearchForBestProjectUsersData(source, sharedProj);
}
