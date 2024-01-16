using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class TrainingData : ProjectData
{
    public static string GetDocId(string sfProjectId, string dataId) => $"{sfProjectId}:{dataId}";

    public string DataId { get; set; }
    public string FileUrl { get; set; }
    public string MimeType { get; set; }
    public int SkipRows { get; set; }
}
