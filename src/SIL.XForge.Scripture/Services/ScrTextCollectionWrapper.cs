using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Wraps access to static methods on <see cref="ScrTextCollection"/>. This class can be stubbed in tests.
    /// </summary>
    public class ScrTextCollectionWrapper : IScrTextCollectionWrapper
    {
        /// <summary>
        /// Sets the directory containing sub-directories of each unique user administering SF projects.
        /// </summary>
        public void Initialize(string syncDir = null, bool allowMigration = false)
        {
            MultiUserLazyScrTextCollection.Initialize(syncDir);
        }

        public ScrText FindById(string username, string projectId)
        {
            return MultiUserLazyScrTextCollection.Get(username).FindById(projectId);
        }
    }
}
