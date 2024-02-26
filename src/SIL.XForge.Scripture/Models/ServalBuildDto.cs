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
}
