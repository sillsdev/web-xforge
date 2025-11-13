using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Paratext.Data.ProjectComments;
using SIL.XForge.Scripture.Models;
using ParatextComment = Paratext.Data.ProjectComments.Comment;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Maps Paratext comment threads into lightweight Scripture Forge note models.
/// </summary>
public class NotesService : INotesService
{
    public IReadOnlyList<ParatextNote> GetNotes(
        CommentManager commentManager,
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
            IReadOnlyList<ParatextComment> activeComments = thread.ActiveComments.ToList();
            if (activeComments.Count == 0)
                continue;

            var comments = new List<ParatextNoteComment>();
            foreach (ParatextComment comment in activeComments)
            {
                comments.Add(CreateNoteComment(comment, commentTags));
            }

            if (comments.Count == 0)
                continue;

            string verseRef = thread.ScriptureSelection?.VerseRef.ToString();
            if (string.IsNullOrEmpty(verseRef))
                verseRef = comments[0].VerseRef;

            notes.Add(
                new ParatextNote
                {
                    Id = thread.Id ?? string.Empty,
                    VerseRef = verseRef ?? string.Empty,
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

        return new ParatextNoteTag { Id = tagId };
    }
}
