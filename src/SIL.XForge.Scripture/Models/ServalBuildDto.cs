using SIL.Machine.WebApi;

namespace SIL.XForge.Scripture.Models;

public class ServalBuildDto : BuildDto
{
    public int QueueDepth { get; set; }
    public ServalBuildAdditionalInfo? AdditionalInfo { get; set; }
}
