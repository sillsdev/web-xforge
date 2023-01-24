using System;
using System.Globalization;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public static class ParatextNoteTestExtensions
    {
        public static string NoteToString(this Note note)
        {
            string result = $"{note.ThreadId}-{note.SyncUserRef}-{note.ExtUserId}-{note.Content}";
            if (note.Deleted)
                result = result + "-deleted";
            if (note.TagId != null)
                result = result + $"-tag:{note.TagId}";
            return result;
        }

        public static string ThreadChangeToString(this NoteThreadChange thread)
        {
            string selection =
                thread.Position == null
                    ? string.Empty
                    : $"-Start:{thread.Position.Start}-Length:{thread.Position.Length}";
            string result =
                thread.ContextBefore + thread.SelectedText + thread.ContextAfter + $"{selection}-{thread.VerseRefStr}";
            if (thread.TagId != null)
                result = result + $"-tag:{thread.TagId}";
            return result;
        }

        public static string NoteThreadToString(this NoteThread thread)
        {
            string selection =
                thread.Position == null
                    ? string.Empty
                    : $"-Start:{thread.Position.Start}-Length:{thread.Position.Length}";
            string result =
                thread.OriginalContextBefore
                + thread.OriginalSelectedText
                + thread.OriginalContextAfter
                + $"{selection}-{thread.VerseRef}-tag:{thread.TagId}";
            return result;
        }

        public static string CommentToString(this Paratext.Data.ProjectComments.Comment comment)
        {
            string result =
                $"{comment.Id}-{comment.VerseRefStr}-{comment.Contents.InnerXml}" + $"-Start:{comment.StartPosition}";
            if (comment.ExternalUser != null)
                result = result + $"-{comment.ExternalUser}";
            if (comment.Deleted)
                result = result + "-deleted";
            if (comment.TagsAdded != null)
                result = result + $"-Tag:{comment.TagsAdded[0]}";
            return result;
        }
    }
}
