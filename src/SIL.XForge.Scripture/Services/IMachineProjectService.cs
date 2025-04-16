using System.IO;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IMachineProjectService
{
    Task<string> AddSmtProjectAsync(string sfProjectId, CancellationToken cancellationToken);

    [Mutex]
    Task BuildProjectForBackgroundJobAsync(
        string curUserId,
        BuildConfig buildConfig,
        bool preTranslate,
        CancellationToken cancellationToken
    );
    Task<string> GetProjectZipAsync(string sfProjectId, Stream outputStream, CancellationToken cancellationToken);
    Task RemoveProjectAsync(string sfProjectId, bool preTranslate, CancellationToken cancellationToken);

    [Mutex]
    Task UpdateTranslationSourcesAsync(string curUserId, string sfProjectId);
}
