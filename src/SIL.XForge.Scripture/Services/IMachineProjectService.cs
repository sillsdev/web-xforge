using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services;

public interface IMachineProjectService
{
    Task<string> AddSmtProjectAsync(string sfProjectId, CancellationToken cancellationToken);
    Task<string> GetProjectZipAsync(string sfProjectId, Stream outputStream, CancellationToken cancellationToken);
    Task RemoveProjectAsync(string sfProjectId, bool preTranslate, CancellationToken cancellationToken);
}
