using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

public interface ISFText
{
    public string Id { get; }
    IEnumerable<SFTextSegment> Segments { get; }
}
