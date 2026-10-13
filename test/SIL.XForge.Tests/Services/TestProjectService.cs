using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

public class TestProjectService(
    IRealtimeService realtimeService,
    IOptions<SiteOptions> siteOptions,
    IAudioService audioService,
    IRepository<TestProjectSecret> projectSecrets,
    IFileSystemService fileSystemService,
    IStorageProvider storageProvider
)
    : ProjectService<TestProject, TestProjectSecret>(
        realtimeService,
        siteOptions,
        audioService,
        projectSecrets,
        fileSystemService,
        storageProvider
    )
{
    protected override string ProjectAdminRole => TestProjectRole.Administrator;

    protected override Task<Attempt<string>> TryGetProjectRoleAsync(TestProject project, string userId) =>
        Task.FromResult(Attempt.Success(TestProjectRole.Reviewer));
}
