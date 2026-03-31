using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services;

/// <summary>Mercurial operations</summary>
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
    string[] Pull(string repositoryPath, byte[] bundle);
    byte[] Bundle(string repositoryPath, params string[] bases);
}
