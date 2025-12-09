using System;
using System.Collections.Generic;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IParatextDataHelper
{
    void CommitVersionedText(ScrText scrText, string comment);

    IReadOnlyList<ParatextNote> GetNotes(
        CommentManager? commentManager,
        CommentTags? commentTags,
        Func<CommentThread, bool>? predicate = null,
        bool includeInactiveThreads = true
    );
}
