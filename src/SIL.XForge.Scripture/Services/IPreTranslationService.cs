using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IPreTranslationService
{
    Task<IEnumerable<VerseConfidence>> GetVerseConfidencesAsync(
        string sfProjectId,
        CancellationToken cancellationToken
    );
    Task<string> GetPreTranslationUsfmAsync(
        string sfProjectId,
        int bookNum,
        int chapterNum,
        DraftUsfmConfig config,
        CancellationToken cancellationToken
    );
}
