using System;
using System.Collections.Generic;
using Paratext.Data;
using Paratext;
using Paratext.Data.Repository;
using System.Linq;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> An internet shared repository source using a JWT token to authenticate </summary>
    class JwtInternetSharedRepositorySource : InternetSharedRepositorySource, IInternetSharedRepositorySource
    {
        public JwtInternetSharedRepositorySource(string accessToken, string username)
        {
            SetToken(accessToken);
        }

        public void RefreshToken(string jwtToken)
        {
            if (client.JwtToken == jwtToken)
                return;
            SetToken(jwtToken);
        }

        public InternetSharedRepositorySource AsInternetSharedRepositorySource()
        {
            return this;
        }

        public override string[] Pull(string repository, SharedRepository pullRepo)
        {
            string tip = GetBaseRevision(repository);

            // Get bundle
            string guid = Guid.NewGuid().ToString();
            List<string> query = new List<string> { "guid", guid, "proj", pullRepo.ScrTextName, "projid",
                        pullRepo.SendReceiveId, "type", "zstd-v2" };
            if (tip != null)
            {
                query.Add("base1");
                query.Add(tip);
            }

            byte[] bundle = client.GetStreaming("pullbundle", query.ToArray());
            // Finish bundle
            client.Get("pullbundlefinish", "guid", guid);
            if (bundle.Length == 0)
                return new string[0];

            // Use bundle
            string[] changeSets = Hg.Default.Pull(repository, bundle, true);

            MarkSharedChangeSetsPublic(repository);
            return changeSets;
        }

        public override void Push(string repository, SharedRepository pushRepo)
        {
            string tip = GetBaseRevision(repository);

            // Create bundle
            byte[] bundle = Hg.Default.Bundle(repository, tip);
            if (bundle.Length == 0)
                return;

            // Send bundle
            string guid = Guid.NewGuid().ToString();
            client.PostStreaming(bundle, "pushbundle", "guid", guid, "proj", pushRepo.ScrTextName, "projid",
                pushRepo.SendReceiveId, "registered", "yes", "userschanged", "no");

            MarkSharedChangeSetsPublic(repository);
        }

        private void SetToken(string jwtToken)
        {
            client.JwtToken = jwtToken;
            // RESTClient only uses the jwtToken if authentication is null;
            ReflectionHelperLite.SetField(client, "authentication", null);
        }

        /// <summary> Get the latest public revision. </summary>
        private string GetBaseRevision(string repository)
        {
            string ids = Hg.Default.RunCommand(repository, "log --rev \"public()\" --template \"{node}\n\"").StdOut;
            return ids.Split(new[] { "\n" }, StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
        }

        /// <summary> Mark all changesets available on the PT server public. </summary>
        private void MarkSharedChangeSetsPublic(string repository)
        {
            Hg.Default.RunCommand(repository, "phase -p -r 'tip'");
        }

    }

    public interface IInternetSharedRepositorySource
    {
        IEnumerable<SharedRepository> GetRepositories();
        string[] Pull(string repository, SharedRepository pullRepo);

        void RefreshToken(string jwtToken);

        /// <summary>Access as a particular class.</summary>
        InternetSharedRepositorySource AsInternetSharedRepositorySource();
    }

    /// <summary> A REST client using a jwt token to authenticate </summary>
    class JwtRESTClient : RESTClient
    {
        public JwtRESTClient(string baseUri, string applicationProductVersion, string jwtToken) : base(baseUri, applicationProductVersion)
        {
            this.JwtToken = jwtToken;
            ReflectionHelperLite.SetField(this, "authentication", null);
        }
    }
}
