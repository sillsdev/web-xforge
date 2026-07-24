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
    /// comments do not all share the same anchor, so FindThreads can return such a thread split
    /// into fragments that share an id. (Biblical-term and spelling-note threads have this shape:
    /// their location-independent ids, such as BT_term and project_word, collect comments
    /// anchored at different verses.) Instead, build every thread the way
    /// <see cref="CommentManager.FindThread(string)"/> does (select comments by thread id and
    /// sort them), but in one pass over the comments rather than one full scan per thread.
    /// Threads are returned ordered by their oldest comment's anchor. The filters are applied to
    /// the complete threads.
    /// </summary>
    public static List<CommentThread> FindCompleteThreads(
        this CommentManager manager,
        Func<CommentThread, bool>? shouldThreadBeIncluded = null,
        bool activeOnly = false
    )
    {
        // Unlike FindThreads and FindThread, AllComments does not take the manager's lock, so
        // this must not run concurrently with mutations of the same project's comments.
        Dictionary<string, CommentThread> threadsById = [];
        foreach (Comment comment in manager.AllComments)
        {
            if (!threadsById.TryGetValue(comment.Thread, out CommentThread? thread))
            {
                thread = new CommentThread { ScrText = manager.ScrText };
                threadsById[comment.Thread] = thread;
            }
            thread.Comments.Add(comment);
        }
        List<CommentThread> threads = [.. threadsById.Values];
        // Comment.CompareTo compares same-thread comments by date and different-thread comments
        // by anchor, so this sorts each thread's comments oldest first (as FindThread does) and
        // then orders the threads by the anchor of each thread's oldest comment.
        foreach (CommentThread thread in threads)
            thread.Comments.Sort();
        threads.Sort((a, b) => a.Comments[0].CompareTo(b.Comments[0]));
        IEnumerable<CommentThread> result = threads;
        if (activeOnly)
            result = result.Where(t => t.Comments.Any(c => !c.Deleted));
        if (shouldThreadBeIncluded is not null)
            result = result.Where(shouldThreadBeIncluded);
        return [.. result];
    }
}
