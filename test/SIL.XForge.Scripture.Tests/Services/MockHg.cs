using System.Collections.Generic;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services;

internal class MockHg : Hg
{
    /// <summary>
    /// A log containing a revision from Paratext
    /// </summary>
    public readonly List<HgRevision> Log =
    [
        new HgRevision
        {
            Id = "2",
            CommitTimeStampString = "2024-11-13T11:43:01+13:00",
            Filenames = "08RUT.SFM",
            ParentsString = "1",
            UserEscaped = "pt_username",
        },
    ];

    public override bool IsRepository(string repository) => true;

    public override List<HgRevision> GetLog(string repository, string startRev, string endRev) => Log;

    public override List<HgRevision> GetLogWithLimit(string repository, int limit) => Log;
}
