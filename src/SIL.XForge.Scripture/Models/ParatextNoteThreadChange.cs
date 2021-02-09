using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models
{
    public enum ChangeType
    {
        Added,
        Updated,
        Deleted
    }

    public class ParatextNoteThreadChange
    {
        public string ThreadId { get; set; }
        public string VerseRefStr { get; set; }
        public string SelectedText { get; set; }
        public List<ParatextNote> NotesAdded { get; set; } = new List<ParatextNote>();
        public List<ParatextNote> NotesUpdated { get; set; } = new List<ParatextNote>();
        public List<ParatextNote> NotesDeleted { get; set; } = new List<ParatextNote>();

        public bool HasChange
        {
            get { return NotesAdded.Count > 0 || NotesUpdated.Count > 0 || NotesDeleted.Count > 0; }
        }

        public ParatextNoteThreadChange(string threadId, string verseRef, string selectedText)
        {
            ThreadId = threadId;
            VerseRefStr = verseRef;
            SelectedText = selectedText;
        }

        public void AddChange(ParatextNote changedNote, ChangeType type)
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
