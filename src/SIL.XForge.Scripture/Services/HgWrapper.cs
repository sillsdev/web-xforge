using System;
using System.Linq;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
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
        /// Get the most recent revision id of the commit from the last push or pull with the PT send/receive server.
        /// </summary>
        public string GetLastPublicRevision(string repository)
        {
            string ids = HgWrapper.RunCommand(repository, "log --rev \"public()\" --template \"{node}\n\"");
            return ids.Split(new[] { "\n" }, StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
        }

        /// <summary> Set the default Mercurial installation. Must be called for all other methods to work. </summary>
        public void SetDefault(Hg hgDefault)
        {
            Hg.Default = hgDefault;

            // This allows SF to intercept some Hg commands involving registration codes
            Hg.DefaultRunnerCreationFunc = (installPathArg, repositoryArg, mergePathArg) =>
                new SFHgRunner(installPathArg, repositoryArg, mergePathArg);
        }

        public void Init(string repository)
        {
            Hg.Default.Init(repository);
        }

        public void Update(string repository)
        {
            Hg.Default.Update(repository);
        }
    }
}
