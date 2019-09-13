using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectUserConfig : ProjectData
    {
        public static string GetDocId(string projectId, string userId)
        {
            return $"{projectId}:{userId}";
        }

        public string SelectedTask { get; set; }
        public int? SelectedBookNum { get; set; }
        public int? SelectedChapterNum { get; set; }

        // translate
        public bool IsTargetTextRight { get; set; } = true;
        public double ConfidenceThreshold { get; set; } = 0.2;
        public bool TranslationSuggestionsEnabled { get; set; } = true;
        public string SelectedSegment { get; set; } = "";
        public int? SelectedSegmentChecksum { get; set; }

        // checking
        public List<string> QuestionRefsRead { get; set; } = new List<string>();
        public List<string> AnswerRefsRead { get; set; } = new List<string>();
        public List<string> CommentRefsRead { get; set; } = new List<string>();
    }
}
