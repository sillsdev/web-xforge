using System.Collections.Generic;
using JsonApiDotNetCore.Models;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectUserResource : ProjectUserResource
    {
        [Attr]
        public string SelectedTask { get; set; }
        [Attr]
        public string SelectedBookId { get; set; }
        [Attr]
        public int SelectedChapter { get; set; }

        // translate
        [Attr]
        public bool IsTargetTextRight { get; set; } = true;
        [Attr]
        public double ConfidenceThreshold { get; set; } = 0.2;
        [Attr]
        public bool IsSuggestionsEnabled { get; set; } = true;
        [Attr]
        public string SelectedSegment { get; set; } = "";
        [Attr]
        public int? SelectedSegmentChecksum { get; set; }

        // checking
        [Attr(isFilterable: false, isSortable: false)]
        public List<string> QuestionRefsRead { get; set; }
        [Attr(isFilterable: false, isSortable: false)]
        public List<string> AnswerRefsRead { get; set; }
        [Attr(isFilterable: false, isSortable: false)]
        public List<string> CommentRefsRead { get; set; }
    }
}
