using System;
using System.Collections.Generic;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
    public interface ISharingLogicWrapper
    {
        bool ShareChanges(List<SharedProject> sharedProjects, SharedRepositorySource source,
            out List<SendReceiveResult> results, IList<SharedProject> reviewProjects);
        SharedProject CreateSharedProject(string projId, string proj, SharedRepositorySource source,
            IEnumerable<SharedRepository> sourceRepositories);
        bool HandleErrors(Action action, bool throwExceptions = false);
    }
}
