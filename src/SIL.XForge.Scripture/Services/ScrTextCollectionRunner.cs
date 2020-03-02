using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public class ScrTextCollectionRunner : IScrTextCollectionRunner
    {
        public ScrText FindById(string projectId, string shortName = null, bool allowInaccessible = false, bool allowUnsupported = false)
        {
            return ScrTextCollection.FindById(projectId, shortName, allowInaccessible, allowUnsupported);
        }
    }
}
