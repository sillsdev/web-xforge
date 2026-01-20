using System.Threading;
using System.Threading.Tasks;
using Paratext.Data;
using Paratext.Data.Languages;

namespace SIL.XForge.Scripture.Services;

public interface IParatextDataHelper
{
    void CommitVersionedText(ScrText scrText, string comment);
    Task MigrateResourceIfRequiredAsync(ScrText scrText, LanguageId? overrideLanguage, CancellationToken token);
}
