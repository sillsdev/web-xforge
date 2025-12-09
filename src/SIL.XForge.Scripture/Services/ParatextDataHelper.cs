using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using Paratext.Data.Repository;
using SIL.XForge.Scripture.Models;
using ParatextComment = Paratext.Data.ProjectComments.Comment;

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

    public IReadOnlyList<ParatextNote> GetNotes(
        CommentManager? commentManager,
        CommentTags? commentTags,
        Func<CommentThread, bool>? predicate = null,
        bool includeInactiveThreads = true
    )
    {
        if (commentManager == null)
            return Array.Empty<ParatextNote>();

        Func<CommentThread, bool> filter = predicate ?? (_ => true);
        IEnumerable<CommentThread> threads = commentManager.FindThreads(filter, includeInactiveThreads);

        var notes = new List<ParatextNote>();
        foreach (CommentThread thread in threads)
        {
            List<ParatextNoteComment> comments =
            [
                .. thread.ActiveComments.Select(comment => CreateNoteComment(comment, commentTags)),
            ];
            if (comments.Count == 0)
                continue;

            string verseRef = thread.ScriptureSelection?.VerseRef.ToString();
            if (string.IsNullOrEmpty(verseRef))
                verseRef = comments[0].VerseRef;

            notes.Add(
                new ParatextNote
                {
                    Id = thread.Id ?? string.Empty,
                    VerseRef = verseRef,
                    Comments = comments,
                }
            );
        }

        return notes;
    }

    private static ParatextNoteComment CreateNoteComment(ParatextComment comment, CommentTags? commentTags)
    {
        ParatextNoteTag? tag = null;
        if (comment.TagsAdded is { Length: > 0 })
        {
            string tagValue = comment.TagsAdded[0];
            if (int.TryParse(tagValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out int tagId))
                tag = CreateNoteTag(tagId, commentTags);
        }

        string content = comment.Contents?.InnerXml ?? string.Empty;
        return new ParatextNoteComment
        {
            VerseRef = comment.VerseRefStr ?? string.Empty,
            Content = content,
            Tag = tag,
        };
    }

    private static ParatextNoteTag CreateNoteTag(int tagId, CommentTags? commentTags)
    {
        if (commentTags != null)
        {
            CommentTag commentTag = commentTags.Get(tagId);
            return new ParatextNoteTag
            {
                Id = commentTag.Id,
                Name = commentTag.Name ?? string.Empty,
                Icon = commentTag.Icon ?? string.Empty,
            };
        }

        return new ParatextNoteTag
        {
            Id = tagId,
            Name = string.Empty,
            Icon = string.Empty,
        };
    }
}
