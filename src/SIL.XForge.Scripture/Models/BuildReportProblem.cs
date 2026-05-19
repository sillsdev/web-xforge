using System.Runtime.Serialization;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A problem regarding a Serval build.
/// </summary>
public class BuildReportProblem
{
    /// <summary>
    /// Where the problem occurred, or what system reported it.
    /// </summary>
    [JsonConverter(typeof(StringEnumConverter))]
    public BuildReportProblemSource Source { get; init; }

    /// <summary>
    /// The severity of the problem.
    /// </summary>
    [JsonConverter(typeof(StringEnumConverter))]
    public BuildReportProblemSeverity Severity { get; init; }

    /// <summary>
    /// A message describing the problem.
    /// </summary>
    public string Message { get; init; } = string.Empty;
}

/// <summary>
/// Origin of a problem.
/// </summary>
public enum BuildReportProblemSource
{
    /// <summary>
    /// The problem occurred in the local application.
    /// </summary>
    [EnumMember(Value = "local")]
    Local,

    /// <summary>
    /// The problem was reported by Serval.
    /// </summary>
    [EnumMember(Value = "serval")]
    Serval,
}

/// <summary>
/// Degree of significance of a problem.
/// </summary>
public enum BuildReportProblemSeverity
{
    [EnumMember(Value = "warning")]
    Warning,

    [EnumMember(Value = "error")]
    Error,
}
