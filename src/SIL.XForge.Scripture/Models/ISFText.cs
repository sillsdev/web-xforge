using System.Collections.Generic;
using SIL.Machine.Corpora;

namespace SIL.XForge.Scripture.Models;

public interface ISFText : IText
{
    IEnumerable<SFTextSegment> Segments { get; }
}
