using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using Paratext;
using Paratext.Data;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using Paratext.Data.RegistryServerAccess;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> An internet shared repository source that networks using JWT authenticated REST clients. </summary>
    class JwtInternetSharedRepositorySource : InternetSharedRepositorySource, IInternetSharedRepositorySource
    {
        private readonly JwtRESTClient _registryClient;

        public JwtInternetSharedRepositorySource(string accessToken, JwtRESTClient registryClient, string srServerUri)
            : base(srServerUri)
        {
            _registryClient = registryClient;
            SetToken(accessToken);
        }

        public void RefreshToken(string jwtToken)
        {
            if (_registryClient.JwtToken == jwtToken)
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
            string[] changeSets = HgWrapper.Pull(repository, bundle);

            MarkSharedChangeSetsPublic(repository);
            return changeSets;
        }

        public override void Push(string repository, SharedRepository pushRepo)
        {
            string tip = GetBaseRevision(repository);

            // Create bundle
            byte[] bundle = HgWrapper.Bundle(repository, tip);
            if (bundle.Length == 0)
                return;

            // Send bundle
            string guid = Guid.NewGuid().ToString();
            client.PostStreaming(bundle, "pushbundle", "guid", guid, "proj", pushRepo.ScrTextName, "projid",
                pushRepo.SendReceiveId, "registered", "yes", "userschanged", "no");

            MarkSharedChangeSetsPublic(repository);
        }

        /// <summary>
        /// Retrieve a list of <see cref="SharedRepository" />. Warning: This depends on the parent class client field.
        /// </summary>
        public override IEnumerable<SharedRepository> GetRepositories()
        {
            return GetRepositories(GetLicensesForUserProjects());
        }

        /// <summary> Gets the licenses for projects. Sourced from InternetSharedRepositorySource. </summary>
        private List<ProjectLicense> GetLicensesForUserProjects()
        {
            JArray licenses = GetJsonArray("my/licenses");
            if (licenses == null)
                return null;
            List<ProjectLicense> result = new List<ProjectLicense>();
            foreach (JObject license in licenses)
            {
                var projLicense = new ProjectLicense(license);
                if (projLicense.IsInvalid || projLicense.IsExpired)
                    continue;
                UserRoles role = RegistryServer.ConvertToUserRole(license["role"]?.ToString());
                if (role == UserRoles.Administrator)
                    result.Add(projLicense);
            }
            return result;
        }

        private JArray GetJsonArray(string cgiCall)
        {
            string projectData = _registryClient.Get(cgiCall);
            if (!string.IsNullOrEmpty(projectData) && !projectData.Equals("null", StringComparison.OrdinalIgnoreCase))
                return JArray.Parse(projectData);
            return null;
        }

        private void SetToken(string jwtToken)
        {
            client.JwtToken = jwtToken;
            // RESTClient only uses the jwtToken if authentication is null;
            ReflectionHelperLite.SetField(client, "authentication", null);
            _registryClient.JwtToken = jwtToken;
        }

        /// <summary> Get the latest public revision. </summary>
        private string GetBaseRevision(string repository)
        {
            string ids = HgWrapper.RunCommand(repository, "log --rev \"public()\" --template \"{node}\n\"");
            return ids.Split(new[] { "\n" }, StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
        }

        /// <summary> Mark all changesets available on the PT server public. </summary>
        private void MarkSharedChangeSetsPublic(string repository)
        {
            HgWrapper.RunCommand(repository, "phase -p -r 'tip'");
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

    /// <summary> A REST client using a JWT token to authenticate. </summary>
    public class JwtRESTClient : RESTClient
    {
        public JwtRESTClient(string baseUri, string applicationProductVersion, string jwtToken)
            : base(baseUri, applicationProductVersion)
        {
            this.JwtToken = jwtToken;
            ReflectionHelperLite.SetField(this, "authentication", null);
        }
    }
}
