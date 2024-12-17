using System.Collections.Generic;
using SIL.Scripture;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class TextAudio : ProjectData
{
    public static string GetDocId(string projectId, int book, int chapter) =>
        $"{projectId}:{Canon.BookNumberToId(book)}:{chapter}:target";

    public string DataId { get; set; }
    public List<AudioTiming> Timings { get; set; } = [];
    public string MimeType { get; set; }
    public string AudioUrl { get; set; }
}
