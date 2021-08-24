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

    public class ParatextNoteThreadChange
    {
        public string ThreadId { get; set; }
        public string VerseRefStr { get; set; }
        public string SelectedText { get; set; }
        public string ContextBefore { get; set; }
        public string ContextAfter { get; set; }
        public int StartPosition { get; set; }
        public SegmentSelection CurrentContextSelection { get; set; }
        public string TagIcon { get; set; }
        /// <summary> True if the thread has been permanently removed. </summary>
        public bool ThreadRemoved { get; set; }
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
                    NoteIdsRemoved.Count > 0 || ThreadRemoved;
            }
        }

        public ParatextNoteThreadChange(string threadId, string verseRef, string selectedText, string contextBefore,
            string contextAfter, int startPos, string tagIcon = null)
        {
            ThreadId = threadId;
            VerseRefStr = verseRef;
            SelectedText = selectedText;
            ContextBefore = contextBefore;
            ContextAfter = contextAfter;
            StartPosition = startPos;
            TagIcon = tagIcon;
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
