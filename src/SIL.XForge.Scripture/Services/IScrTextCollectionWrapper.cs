using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public interface IScrTextCollectionWrapper
    {
        void Initialize(string settingsDir = null, bool allowMigration = false);
        ScrText FindById(string username, string projectId);
    }
}
