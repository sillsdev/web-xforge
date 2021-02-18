using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Usage information for a short amount of user activity in the editor component.
    /// </summary>
    public class TranslateMetrics : IIdentifiable
    {
        public string Id { get; set; }
        public string Type { get; set; }
        public string SessionId { get; set; }
        public string UserRef { get; set; }
        public string ProjectRef { get; set; }
        public int BookNum { get; set; }
        public int ChapterNum { get; set; }
        public DateTime Timestamp { get; set; }

        // editing metrics
        public string Segment { get; set; }
        public int? SourceWordCount { get; set; }
        public int? TargetWordCount { get; set; }
        public int? KeyBackspaceCount { get; set; }
        public int? KeyDeleteCount { get; set; }
        public int? KeyCharacterCount { get; set; }
        public int? ProductiveCharacterCount { get; set; }
        public int? SuggestionAcceptedCount { get; set; }
        public int? SuggestionTotalCount { get; set; }
        /// <remarks>In milliseconds.</remarks>
        public int? TimeEditActive { get; set; }
        public string EditEndEvent { get; set; }

        // navigation metrics
        public int? KeyNavigationCount { get; set; }
        public int? MouseClickCount { get; set; }
    }
}
