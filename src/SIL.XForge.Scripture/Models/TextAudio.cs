using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class TextAudio : ProjectData
{
    public string DataId { get; set; }
    public List<AudioTiming> Timings { get; set; } = new List<AudioTiming>();
    public string MimeType { get; set; }
    public string AudioUrl { get; set; }
}
