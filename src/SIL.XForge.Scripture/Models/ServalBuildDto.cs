namespace SIL.XForge.Scripture.Models;

public class ServalBuildDto : ServalResourceDto
{
    public int QueueDepth { get; set; }
    public ServalBuildAdditionalInfo? AdditionalInfo { get; set; }
    public int Revision { get; set; }
    public ServalResourceDto Engine { get; set; }
    public double PercentCompleted { get; set; }
    public string? Message { get; set; }
    public string State { get; set; }

    /// <summary>
    /// The Serval deployment version that executed this build.
    /// </summary>
    public string? DeploymentVersion { get; set; }

    /// <summary>
    /// Execution data from the Serval build, including training/pretranslation counts and language tags.
    /// </summary>
    public ServalBuildExecutionData? ExecutionData { get; set; }
}
