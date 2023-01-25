#nullable enable annotations
using System;
using System.IO;
using System.Linq;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services;

/// <summary> A wrapper for the <see cref="Hg" /> class for calling Mercurial. </summary>
public class HgWrapper : IHgWrapper
{
    public static string RunCommand(string repository, string cmd)
    {
        if (Hg.Default == null)
            throw new InvalidOperationException("Hg default has not been set.");
        return Hg.Default.RunCommand(repository, cmd).StdOut;
    }

    public static byte[] Bundle(string repository, params string[] heads)
    {
        if (Hg.Default == null)
            throw new InvalidOperationException("Hg default has not been set.");
        return Hg.Default.Bundle(repository, heads);
    }

    public static string[] Pull(string repository, byte[] bundle)
    {
        if (Hg.Default == null)
            throw new InvalidOperationException("Hg default has not been set.");
        return Hg.Default.Pull(repository, bundle, true);
    }

    /// <summary>
    /// Backups the repository.
    /// </summary>
    /// <param name="repository">The repository.</param>
    /// <param name="backupFile">The backup file to create. This string must be encoded correctly.</param>
    public void BackupRepository(string repository, string backupFile) =>
        RunCommand(repository, $"bundle -a --type v2 \"{backupFile}\"");

    /// <summary>
    /// Get the most recent revision id of the commit from the last push or pull with the PT send/receive server.
    /// </summary>
    /// <param name="repository">The full path to the repository directory.</param>
    /// <returns>
    /// The Mercurial revision identifier.
    /// </returns>
    public string GetLastPublicRevision(string repository)
    {
        string ids = RunCommand(repository, "log --rev \"public()\" --template \"{node}\n\"");
        string revision = ids.Split(new[] { "\n" }, StringSplitOptions.RemoveEmptyEntries).LastOrDefault()?.Trim();
        return revision;
    }

    /// <summary>
    /// Returns the currently checked out revision of an hg repository.
    /// </summary>
    public string GetRepoRevision(string repositoryPath)
    {
        string rev = RunCommand(repositoryPath, "log --limit 1 --rev . --template {node}");
        if (string.IsNullOrWhiteSpace(rev))
        {
            throw new InvalidDataException($"Unable to determine repo revision for hg repo at {repositoryPath}");
        }
        return rev;
    }

    /// <summary>
    /// Restores the repository.
    /// </summary>
    /// <param name="destination">The destination to restore to.</param>
    /// <param name="backupFile">The backup file to restore from. This string must be encoded correctly.</param>
    public void RestoreRepository(string destination, string backupFile)
    {
        if (Hg.Default == null)
            throw new InvalidOperationException("Hg default has not been set.");

        Hg.Default.Init(destination);
        Hg.Default.Unbundle(destination, backupFile);
        Hg.Default.Update(destination);
    }

    /// <summary>
    /// Mark all changesets available on the PT server public.
    /// </summary>
    /// <param name="repository">The repository.</param>
    public void MarkSharedChangeSetsPublic(string repository) => RunCommand(repository, "phase -p -r 'tip'");

    /// <summary> Set the default Mercurial installation. Must be called for all other methods to work. </summary>
    public void SetDefault(Hg hgDefault)
    {
        Hg.Default = hgDefault;

        // This allows SF to intercept some Hg commands involving registration codes
        Hg.DefaultRunnerCreationFunc = (installPathArg, repositoryArg, mergePathArg) =>
            new SFHgRunner(installPathArg, repositoryArg, mergePathArg);
    }

    public void Init(string repository) => Hg.Default.Init(repository);

    public void Update(string repository) => Hg.Default.Update(repository);

    /// <summary>
    /// Set a hg repo's files to a particular revision in history. Similar to running
    /// `git checkout --force --detach COMMITTISH`
    /// Changes to tracked files will be discarded. Untracked files are left in place without being cleaned up.
    /// </summary>
    public void Update(string repositoryPath, string rev) => Hg.Default.Update(repositoryPath, rev);
}
