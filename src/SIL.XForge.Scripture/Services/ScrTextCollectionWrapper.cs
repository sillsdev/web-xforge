using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Wraps access to static methods on <see cref="ScrTextCollection"/>. This class can be stubbed in tests.
    /// </summary>
    public class ScrTextCollectionWrapper : IScrTextCollectionWrapper
    {
        public void Initialize(string syncDir = null, bool allowMigration = false)
        {
            MultiUserLazyScrTextCollection.Initialize(syncDir);
        }

        public ScrText FindById(string username, string projectId)
        {
            return MultiUserLazyScrTextCollection.Get(username).FindById(projectId);
        }

        public void RefreshScrTexts(string settingsDir)
        {
            // Some Paratext.Data classes depend on ScrTextCollection being up-to-date, even if SF code
            // does not make use of it
            ScrTextCollection.Initialize(settingsDir);
            ScrTextCollection.RefreshScrTexts();
        }
    }
}
