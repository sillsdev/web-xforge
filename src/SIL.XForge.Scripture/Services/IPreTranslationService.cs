using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IPreTranslationService
{
    Task<PreTranslation[]> GetPreTranslationsAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    );

    Task<string> GetPreTranslationUsfmAsync(
        string curUserId,
        string sfProjectId,
        int bookNum,
        int chapterNum,
        CancellationToken cancellationToken
    );

    Task UpdatePreTranslationStatusAsync(string sfProjectId, CancellationToken cancellationToken);
}
