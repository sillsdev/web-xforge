using System;
using System.Collections.Generic;
using System.Linq;
using Paratext.Data.ProjectComments;

namespace SIL.XForge.Scripture.Services;

/// <summary> Extension methods for ParatextData's <see cref="CommentManager"/>. </summary>
public static class CommentManagerExtensions
{
    /// <summary>
    /// Finds comment threads, like
    /// <see cref="CommentManager.FindThreads(Func{CommentThread, bool}, bool, bool)"/>, but with
    /// every thread guaranteed to be complete. FindThreads sorts all comments and then groups only
    /// adjacent comments that share a thread id. Its sort order is undefined for a thread whose
    /// comments do not all share the same anchor - true of biblical-term and spelling-note
    /// threads, whose location-independent ids (BT_term, project_word) collect comments anchored
    /// at different verses - so FindThreads can return such a thread split into fragments that
    /// share an id. Any thread that comes back
    /// split is rebuilt with <see cref="CommentManager.FindThread(string)"/>, which selects
    /// comments by id and is therefore always complete. The filters are applied to the complete
    /// threads.
    /// </summary>
    public static List<CommentThread> FindCompleteThreads(
        this CommentManager manager,
        Func<CommentThread, bool>? shouldThreadBeIncluded = null,
        bool activeOnly = false
    )
    {
        List<CommentThread> threads = [];
        Dictionary<string, int> threadIndexById = [];
        foreach (CommentThread thread in manager.FindThreads())
        {
            if (threadIndexById.TryGetValue(thread.Id, out int index))
                threads[index] = manager.FindThread(thread.Id);
            else
            {
                threadIndexById[thread.Id] = threads.Count;
                threads.Add(thread);
            }
        }
        IEnumerable<CommentThread> result = threads;
        if (activeOnly)
            result = result.Where(t => t.Comments.Any(c => !c.Deleted));
        if (shouldThreadBeIncluded is not null)
            result = result.Where(shouldThreadBeIncluded);
        return [.. result];
    }
}
