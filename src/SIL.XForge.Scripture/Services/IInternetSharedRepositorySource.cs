using System.Collections.Generic;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Services;

public interface IInternetSharedRepositorySource
{
    IEnumerable<SharedRepository> GetRepositories();
    IEnumerable<SharedRepository> GetRepositories(List<ProjectLicense> licenses);
    ProjectLicense? GetLicenseForUserProject(string paratextId);
    IEnumerable<ProjectMetadata> GetProjectsMetaData();
    ProjectMetadata? GetProjectMetadata(string paratextId);
    string[] Pull(string repository, SharedRepository pullRepo);
    void RefreshToken(string jwtToken);
    void UnlockRemoteRepository(SharedRepository sharedRepo);
    bool CanUserAuthenticateToPTArchives();

    /// <summary> Access as a particular class. </summary>
    InternetSharedRepositorySource AsInternetSharedRepositorySource();
}
