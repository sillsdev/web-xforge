using System.Collections.Generic;
using System.Runtime.Serialization;
using System.Text.Json.Serialization;
using Newtonsoft.Json.Converters;

namespace SIL.XForge.Scripture.Models;

public class LynxInsightUserData
{
    public LynxInsightPanelUserData? PanelData { get; set; }

    /// <summary>
    /// Gets or sets whether Lynx auto-corrections (on-type edits) are enabled for this user.
    /// </summary>
    public bool? AutoCorrectionsEnabled { get; set; }

    /// <summary>
    /// Gets or sets whether Lynx assessments (insights) are enabled for this user.
    /// </summary>
    public bool? AssessmentsEnabled { get; set; }
}

public class LynxInsightPanelUserData
{
    public bool IsOpen { get; set; }
    public LynxInsightFilter Filter { get; set; } = new();
    public LynxInsightSortOrder SortOrder { get; set; }
}

[JsonConverter(typeof(StringEnumConverter))]
public enum LynxInsightType
{
    [EnumMember(Value = "info")]
    Info,

    [EnumMember(Value = "warning")]
    Warning,

    [EnumMember(Value = "error")]
    Error,
}

[JsonConverter(typeof(StringEnumConverter))]
public enum LynxInsightFilterScope
{
    [EnumMember(Value = "project")]
    Project,

    [EnumMember(Value = "book")]
    Book,

    [EnumMember(Value = "chapter")]
    Chapter,
}

[JsonConverter(typeof(StringEnumConverter))]
public enum LynxInsightSortOrder
{
    [EnumMember(Value = "severity")]
    Severity,

    [EnumMember(Value = "appearance")]
    Appearance,
}

public class LynxInsightFilter
{
    public List<LynxInsightType> Types { get; set; } = [];
    public LynxInsightFilterScope Scope { get; set; }
    public bool? IncludeDismissed { get; set; }
}
