

using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public interface IScrTextCollectionRunner
    {
        void Initialize(string settingsDir = null, bool allowMigration = false);
        ScrText FindById(string projectId, string shortName = null, bool allowInaccessible = false, bool allowUnsupported = false);
        ScrText GetById(string projectId, string shortName = null);

    }
}
