using System.Threading;
using System.Threading.Tasks;
using Serval.Client;

namespace SIL.XForge.Scripture.Services;

public interface IMachineProjectService
{
    Task AddProjectAsync(string curUserId, string sfProjectId, bool preTranslate, CancellationToken cancellationToken);
    Task<TranslationBuild?> BuildProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    );
    Task BuildProjectForBackgroundJobAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    );
    Task RemoveProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    );
    Task<bool> SyncProjectCorporaAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    );
}
