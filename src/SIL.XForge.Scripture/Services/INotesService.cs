using System;
using System.Collections.Generic;
using Paratext.Data.ProjectComments;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides helpers for retrieving and mapping Paratext note threads into Scripture Forge models.
/// </summary>
public interface INotesService
{
    IReadOnlyList<ParatextNote> GetNotes(
        CommentManager commentManager,
        CommentTags? commentTags,
        Func<CommentThread, bool>? predicate = null,
        bool includeInactiveThreads = true
    );
}
