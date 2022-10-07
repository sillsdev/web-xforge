#nullable enable

using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineCorporaService
    {
        Task<string> AddCorpusAsync(string name, CancellationToken cancellationToken);
        Task<bool> AddCorpusToTranslationEngineAsync(
            string translationEngineId,
            string corpusId,
            bool pretranslate,
            CancellationToken cancellationToken
        );
        Task<string> UploadParatextCorpusAsync(
            string corpusId,
            string languageTag,
            string path,
            CancellationToken cancellationToken
        );
    }
}
