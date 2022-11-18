using SIL.XForge.Scripture.Models;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services
{
    public interface IMachineCorporaService
    {
        Task<string> AddCorpusAsync(string name, bool paratext, CancellationToken cancellationToken);
        Task<bool> AddCorpusToTranslationEngineAsync(
            string translationEngineId,
            string corpusId,
            bool pretranslate,
            CancellationToken cancellationToken
        );
        Task DeleteCorpusAsync(string corpusId, CancellationToken cancellationToken);
        Task DeleteCorpusFileAsync(string corpusId, string fileId, CancellationToken cancellationToken);
        Task<IList<MachineApiCorpusFile>> GetCorpusFilesAsync(string corpusId, CancellationToken cancellationToken);
        Task<string> UploadCorpusTextAsync(
            string corpusId,
            string languageTag,
            string textId,
            string text,
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
