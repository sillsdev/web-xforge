using System;
using System.Collections.Generic;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public interface ITransceleratorService
    {
        IEnumerable<TransceleratorQuestion> Questions(string paratextId);
        [Obsolete("Only here for clients still running a front end that still calls it")]
        bool HasQuestions(string paratextId);
    }
}
