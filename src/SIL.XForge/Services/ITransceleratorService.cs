using System.Collections.Generic;

namespace SIL.XForge.Services
{
    public interface ITransceleratorService
    {
        IEnumerable<TransceleratorQuestion> Questions(string paratextId);
        bool HasQuestions(string paratextId);
    }
}
