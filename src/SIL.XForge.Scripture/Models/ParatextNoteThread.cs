using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class ParatextNoteThread : ProjectData
    {
        public string DataId { get; set; }
        public VerseRefData VerseRef { get; set; }
        public List<ParatextNote> Notes { get; set; } = new List<ParatextNote>();
        public string SelectedText { get; set; }
        public string ParatextUser { get; set; }
        public string TagIcon { get; set; }
    }
}
