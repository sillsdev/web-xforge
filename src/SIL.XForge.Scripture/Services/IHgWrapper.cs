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
    string GetRepoRevision(string repository);
    void MarkSharedChangeSetsPublic(string repository);
    string[] Pull(string repository, byte[] bundle);
    byte[] Bundle(string repository, params string[] baseRevisions);
    string RecentLogGraph(string repositoryPath);
    string[] GetDraftRevisions(string repositoryPath);
}
