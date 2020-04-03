using System.Collections.Generic;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
    public interface IInternetSharedRepositorySource
    {
        IEnumerable<SharedRepository> GetRepositories();
        string[] Pull(string repository, SharedRepository pullRepo);
        void RefreshToken(string jwtToken);
        /// <summary> Access as a particular class. </summary>
        InternetSharedRepositorySource AsInternetSharedRepositorySource();
    }
}
