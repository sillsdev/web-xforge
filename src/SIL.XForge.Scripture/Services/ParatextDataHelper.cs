using System;
using Paratext.Data;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services;

/// <summary> Provides methods calls to Paratext Data. Can be mocked in tests. </summary>
public class ParatextDataHelper : IParatextDataHelper
{
    public void CommitVersionedText(ScrText scrText, string comment)
    {
        // Commit() will fail silently if the user is an Observer,
        // so throw an error if the user is an Observer.
        if (!scrText.Permissions.HaveRoleNotObserver)
        {
            throw new InvalidOperationException("User does not have permission to commit.");
        }

        // Write the commit to the repository
        VersionedText vText = VersioningManager.Get(scrText);
        vText.Commit(comment, null, false);
    }
}
