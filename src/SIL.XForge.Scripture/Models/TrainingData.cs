using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class TrainingData : ProjectData
{
    public static string GetDocId(string sfProjectId, string dataId) => $"{sfProjectId}:{dataId}";

    public string DataId { get; set; } = string.Empty;
    public string FileUrl { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public int SkipRows { get; set; }
    public string Title { get; set; } = string.Empty;
}
