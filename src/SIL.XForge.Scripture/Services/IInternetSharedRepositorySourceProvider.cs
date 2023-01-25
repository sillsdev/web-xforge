using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services;

public interface IInternetSharedRepositorySourceProvider
{
    IInternetSharedRepositorySource GetSource(
        UserSecret userSecret,
        string sendReceiveServerUri,
        string registryServerUri
    );
}
