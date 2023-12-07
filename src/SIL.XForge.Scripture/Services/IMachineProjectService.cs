using System.Threading;
using System.Threading.Tasks;
using Serval.Client;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IMachineProjectService
{
    Task<string> AddProjectAsync(
        string curUserId,
        string sfProjectId,
        bool preTranslate,
        CancellationToken cancellationToken
    );
    Task<TranslationBuild?> BuildProjectAsync(
        string curUserId,
        BuildConfig buildConfig,
        bool preTranslate,
        CancellationToken cancellationToken
    );
    Task BuildProjectForBackgroundJobAsync(
        string curUserId,
        BuildConfig buildConfig,
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
        BuildConfig buildConfig,
        bool preTranslate,
        CancellationToken cancellationToken
    );
}
