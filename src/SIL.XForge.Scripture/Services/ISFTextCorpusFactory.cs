using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.Machine.Corpora;
using SIL.Machine.WebApi.Services;

namespace SIL.XForge.Scripture.Services;

public interface ISFTextCorpusFactory
{
    Task<ITextCorpus> CreateAsync(
        IEnumerable<string> projects,
        TextCorpusType type,
        bool preTranslate,
        bool useAlternateTrainingSource,
        ICollection<int> books
    );
}
