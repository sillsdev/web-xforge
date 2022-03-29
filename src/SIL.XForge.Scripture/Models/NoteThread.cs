using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class NoteThread : ProjectData
    {
        public string DataId { get; set; }
        public VerseRefData VerseRef { get; set; }
        public List<Note> Notes { get; set; } = new List<Note>();
        public string OriginalSelectedText { get; set; }
        public string OriginalContextBefore { get; set; }
        public string OriginalContextAfter { get; set; }
        public TextAnchor Position { get; set; }
        public string ParatextUser { get; set; }
        public string TagIcon { get; set; }
        public string Status { get; set; }
        /// <summary>
        /// Who this note thread is assigned to. This may be a <see cref="ParatextUserProfile" /> OpaqueUserId,
        /// or a category such as team or unassigned.
        /// </summary>
        public string Assignment { get; set; }
    }
}
