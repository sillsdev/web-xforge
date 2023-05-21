using System.Collections.Generic;
using Paratext.Data;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services;

public interface IParatextDataHelper
{
    void CommitVersionedText(ScrText scrText, string comment);
    IEnumerable<(ProjectFileType, int[])> GetRevisionChanges(ScrText scrText, string[] revisionIds);
}
