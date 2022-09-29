using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
    public interface IHgWrapper
    {
        void SetDefault(Hg hgDefault);
        void Init(string repository);
        void Update(string repository);
        void Update(string repository, string rev);
        void BackupRepository(string repository, string backupFile);
        void RestoreRepository(string destination, string backupFile);
        string GetLastPublicRevision(string repository);
        string GetRepoRevision(string repositoryPath);
        void MarkSharedChangeSetsPublic(string repository);
    }
}
