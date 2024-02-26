using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public enum TextCorpusType
{
    Source,
    Target,
}

public interface ISFTextCorpusFactory
{
    Task<IEnumerable<ISFText>> CreateAsync(
        IEnumerable<string> projects,
        TextCorpusType type,
        bool preTranslate,
        bool useAlternateTrainingSource,
        BuildConfig buildConfig
    );
}
