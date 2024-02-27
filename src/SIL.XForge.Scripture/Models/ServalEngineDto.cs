using System;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The DTO used to describe a Serval Translation Engine to the frontend.
/// </summary>
/// <remarks>
/// This DTO is designed to keep compatibility with the frontend which used the in-process Machine.
/// </remarks>
public class ServalEngineDto : ServalResourceDto
{
    public string SourceLanguageTag { get; set; } = string.Empty;
    public string TargetLanguageTag { get; set; } = string.Empty;

    [Obsolete("Used by In-Process Machine")]
    public bool IsShared { get; set; }
    public ServalResourceDto[] Projects { get; set; } = [];
    public double Confidence { get; set; }
    public int TrainedSegmentCount { get; set; }
}
