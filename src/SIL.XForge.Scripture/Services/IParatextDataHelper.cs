using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectComments;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IParatextDataHelper
{
    void CommitVersionedText(ScrText scrText, string comment);
    IReadOnlyList<ParatextNote> GetNotes(CommentManager commentManager, CommentTags commentTags);
    Task MigrateResourceIfRequiredAsync(ScrText scrText, LanguageId? overrideLanguage, CancellationToken token);
}
