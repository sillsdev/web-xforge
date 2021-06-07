using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
    public interface IHgWrapper
    {
        void SetDefault(Hg hgDefault);
        void Init(string repository);
        void Update(string repository);
        void BackupRepository(string repository, string backupFile);
        string GetLastPublicRevision(string repository);
    }
}
