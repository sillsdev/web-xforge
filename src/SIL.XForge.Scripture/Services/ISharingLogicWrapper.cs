using System;
using System.Collections.Generic;
using Paratext.Data.Repository;
using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Services;

public interface ISharingLogicWrapper
{
    bool ShareChanges(
        List<SharedProject> sharedProjects,
        SharedRepositorySource source,
        out List<SendReceiveResult> results,
        IList<SharedProject> reviewProjects
    );
    bool HandleErrors(Action action, bool throwExceptions = false);
    PermissionManager SearchForBestProjectUsersData(SharedRepositorySource source, SharedProject sharedProj);
}
