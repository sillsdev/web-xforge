using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class TextAudio : ProjectData
{
    public static string GetDocId(string projectId, int book, int chapter) => $"{projectId}:{book}:{chapter}:target";

    public string DataId { get; set; }
    public List<AudioTiming> Timings { get; set; } = new List<AudioTiming>();
    public string MimeType { get; set; }
    public string AudioUrl { get; set; }
}
