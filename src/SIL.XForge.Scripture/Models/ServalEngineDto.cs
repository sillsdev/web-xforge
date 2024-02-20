namespace SIL.XForge.Scripture.Models;

public class ServalEngineDto : ServalResourceDto
{
    public string SourceLanguageTag { get; set; }
    public string TargetLanguageTag { get; set; }
    public bool IsShared { get; set; }
    public ServalResourceDto[] Projects { get; set; }
    public double Confidence { get; set; }
    public int TrainedSegmentCount { get; set; }
}
