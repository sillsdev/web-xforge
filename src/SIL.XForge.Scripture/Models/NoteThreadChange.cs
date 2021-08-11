using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    public enum ChangeType
    {
        Added,
        Updated,
        Deleted,
        None
    }

    /// <summary>
    /// Represents changes in a Paratext CommentThread.
    /// </summary>
    public class NoteThreadChange
    {
        public string ThreadId { get; set; }
        public string VerseRefStr { get; set; }
        public string SelectedText { get; set; }
        public string ContextBefore { get; set; }
        public string ContextAfter { get; set; }
        public TextAnchor Position { get; set; }
        public string TagIcon { get; set; }
        public bool Resolved { get; set; }
        /// <summary> True if the thread has been permanently removed. </summary>
        public bool ThreadRemoved { get; set; }
        public bool ThreadUpdated { get; set; }
        public List<Note> NotesAdded { get; set; } = new List<Note>();
        public List<Note> NotesUpdated { get; set; } = new List<Note>();
        public List<Note> NotesDeleted { get; set; } = new List<Note>();
        /// <summary> IDs for notes that have been permanently removed. </summary>
        public List<string> NoteIdsRemoved { get; set; } = new List<string>();

        public bool HasChange
        {
            get
            {
                return NotesAdded.Count > 0 || NotesUpdated.Count > 0 || NotesDeleted.Count > 0 ||
                    NoteIdsRemoved.Count > 0 || ThreadRemoved || ThreadUpdated || Position != null;
            }
        }

        public NoteThreadChange(string threadId, string verseRef, string selectedText, string contextBefore,
            string contextAfter, string tagIcon = null, bool resolved = false)
        {
            ThreadId = threadId;
            VerseRefStr = verseRef;
            SelectedText = selectedText;
            ContextBefore = contextBefore;
            ContextAfter = contextAfter;
            TagIcon = tagIcon;
            Resolved = resolved;
        }

        public void AddChange(Note changedNote, ChangeType type)
        {
            switch (type)
            {
                case ChangeType.Added:
                    NotesAdded.Add(changedNote);
                    break;
                case ChangeType.Updated:
                    NotesUpdated.Add(changedNote);
                    break;
                case ChangeType.Deleted:
                    NotesDeleted.Add(changedNote);
                    break;
                default:
                    break;
            }
        }
    }
}
