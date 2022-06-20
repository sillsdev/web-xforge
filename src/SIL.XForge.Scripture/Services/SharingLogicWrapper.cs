using System;
using System.Linq;
using System.Collections.Generic;
using Paratext.Data;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
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
            return SharingLogic.ShareChanges(sharedProjects, source, out results, reviewProjects);
        }

        public bool HandleErrors(Action action, bool throwExceptions = false)
        {
            return SharingLogic.HandleErrors(action, throwExceptions);
        }
    }
}
