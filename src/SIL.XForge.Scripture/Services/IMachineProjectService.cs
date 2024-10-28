using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services;

public interface IMachineProjectService
{
    Task<string> AddProjectAsync(string sfProjectId, bool preTranslate, CancellationToken cancellationToken);
    Task<string> GetProjectZipAsync(string sfProjectId, Stream outputStream, CancellationToken cancellationToken);
    Task<string> GetTranslationEngineTypeAsync(bool preTranslate);
    Task RemoveProjectAsync(string sfProjectId, bool preTranslate, CancellationToken cancellationToken);
}
