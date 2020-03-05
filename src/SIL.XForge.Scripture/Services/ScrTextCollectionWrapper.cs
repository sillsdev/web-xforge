using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>Wraps access to static methods on ScrTextCollection with a class implementing a mockable interface.</summary>
    public class ScrTextCollectionWrapper : IScrTextCollectionWrapper
    {
        public void Initialize(string settingsDir = null, bool allowMigration = false)
        {
            ScrTextCollection.Initialize(settingsDir, allowMigration);
        }

        public ScrText FindById(string projectId, string shortName = null, bool allowInaccessible = false, bool allowUnsupported = false)
        {
            return ScrTextCollection.FindById(projectId, shortName, allowInaccessible, allowUnsupported);
        }

        public ScrText GetById(string projectId, string shortName = null)
        {
            return ScrTextCollection.GetById(projectId, shortName);
        }
    }
}
