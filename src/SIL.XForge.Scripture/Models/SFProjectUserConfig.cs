using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class SFProjectUserConfig : ProjectData
{
    public static string GetDocId(string projectId, string userId) => $"{projectId}:{userId}";

    public string SelectedTask { get; set; }
    public int? SelectedBookNum { get; set; }
    public int? SelectedChapterNum { get; set; }

    // translate
    public bool IsTargetTextRight { get; set; } = true;
    public double ConfidenceThreshold { get; set; } = 0.2;
    public int NumSuggestions { get; set; } = 1;
    public bool TranslationSuggestionsEnabled { get; set; } = true;
    public string SelectedSegment { get; set; } = "";
    public int? SelectedSegmentChecksum { get; set; }

    /// <summary>Ids of notes (not threads) which the user has read.</summary>
    public List<string> NoteRefsRead { get; set; } = [];

    // checking
    public List<string> QuestionRefsRead { get; set; } = [];
    public List<string> AnswerRefsRead { get; set; } = [];
    public List<string> CommentRefsRead { get; set; } = [];
    public List<EditorTabPersistData> EditorTabsOpen { get; set; } = [];
    public LynxInsightUserData? LynxInsightState { get; set; }
    public string? SelectedQuestionRef { get; set; }

    [Obsolete("For backwards compatibility with older frontend clients. Deprecated September 2024.")]
    public bool? BiblicalTermsEnabled { get; set; }
    public bool TransliterateBiblicalTerms { get; set; }
    public string? SelectedBiblicalTermsCategory { get; set; }
    public string? SelectedBiblicalTermsFilter { get; set; }
}
