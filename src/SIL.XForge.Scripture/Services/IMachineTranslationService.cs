using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using SIL.Machine.WebApi;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineTranslationService
    {
        Task<string> CreateTranslationEngineAsync(
            string name,
            string sourceLanguageTag,
            string targetLanguageTag,
            bool smtTransfer,
            CancellationToken cancellationToken
        );
        Task DeleteTranslationEngineAsync(string translationEngineId, CancellationToken cancellationToken);
        Task<MachineApiTranslationEngine> GetTranslationEngineAsync(
            string translationEngineId,
            CancellationToken cancellationToken
        );
        Task<WordGraphDto> GetWordGraphAsync(
            string translationEngineId,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        );
        Task TrainSegmentAsync(
            string translationEngineId,
            SegmentPairDto segmentPair,
            CancellationToken cancellationToken
        );
        Task<TranslationResultDto> TranslateAsync(
            string translationEngineId,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        );
        Task<TranslationResultDto[]> TranslateNAsync(
            string translationEngineId,
            int n,
            IEnumerable<string> segment,
            CancellationToken cancellationToken
        );
    }
}
