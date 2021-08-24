using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class ParatextNoteThread : ProjectData
    {
        public string DataId { get; set; }
        public VerseRefData VerseRef { get; set; }
        public List<Note> Notes { get; set; } = new List<Note>();
        public string SelectedText { get; set; }
        public string ContextBefore { get; set; }
        public string ContextAfter { get; set; }
        // May be able to remove this altogether
        public int StartPosition { get; set; }
        public SegmentSelection CurrentContextSelection { get; set; }
        public string ParatextUser { get; set; }
        public string TagIcon { get; set; }
    }
}
