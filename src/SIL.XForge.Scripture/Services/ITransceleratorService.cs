using System.Collections.Generic;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface ITransceleratorService
{
    IEnumerable<TransceleratorQuestion> Questions(string paratextId);
}
