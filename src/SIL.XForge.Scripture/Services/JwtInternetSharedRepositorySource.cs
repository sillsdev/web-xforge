using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using Paratext;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using Paratext.Data.RegistryServerAccess;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> An internet shared repository source that networks using JWT authenticated REST clients. </summary>
    class JwtInternetSharedRepositorySource : InternetSharedRepositorySource, IInternetSharedRepositorySource
    {
        private readonly JwtRestClient _registryClient;
        private readonly IHgWrapper _hgWrapper;

        public JwtInternetSharedRepositorySource(string accessToken, JwtRestClient registryClient, IHgWrapper hgWrapper,
            ParatextUser authenticationPtUser, string srServerUri)
            : base(authenticationPtUser, srServerUri)
        {
            _registryClient = registryClient;
            _hgWrapper = hgWrapper;
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

        /// <summary>
        /// Uses the a REST client to pull from the Paratext send/receive server. This overrides the base implementation
        /// to avoid needing the current user's Paratext registration code to get the base revision.
        /// </summary>
        public override string[] Pull(string repository, SharedRepository pullRepo)
        {
            string tip = GetBaseRevision(repository);

            // Get bundle
            string guid = Guid.NewGuid().ToString();
            List<string> query = new List<string> { "guid", guid, "proj", pullRepo.ScrTextName, "projid",
                        pullRepo.SendReceiveId.Id, "type", "zstd-v2" };
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

        /// <summary>
        /// Uses the a REST client to push to the Paratext send/receive server. This overrides the base implementation
        /// to avoid needing the current user's Paratext registration code to get the base revision.
        /// </summary>
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
                pushRepo.SendReceiveId.Id, "registered", "yes", "userschanged", "no");

            MarkSharedChangeSetsPublic(repository);
        }

        /// <summary>
        /// This looks like it would be important, but it doesn't seem to matter what it returns, to synchronize.
        /// </summary>
        public override string GetHgUri(SharedRepository sharedRepository)
        {
            return string.Empty;
        }

        /// <summary>
        /// Retrieve a list of <see cref="SharedRepository" />.
        /// </summary>
        public override IEnumerable<SharedRepository> GetRepositories()
        {
            return GetRepositories(GetLicensesForUserProjects());
        }

        /// <summary>
        /// Gets the metadata information for all projects that the current user is on.
        /// Sourced from <see cref="RegistryServer" />.
        /// </summary>
        public IEnumerable<ProjectMetadata> GetProjectsMetaData()
        {
            JArray projects = GetJsonArray("my/projects");
            return projects == null ? null : projects.Select(p => new ProjectMetadata((JObject)p)).ToList();
        }

        /// <summary>
        /// Gets the licenses for all projects the current user is a member of.
        /// Sourced from <see cref="RegistryServer" />.
        /// </summary>
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
            // RestClient only uses the jwtToken if authentication is null;
            ReflectionHelperLite.SetField(client, "authentication", null);
            _registryClient.JwtToken = jwtToken;
        }

        /// <summary> Get the latest public revision. </summary>
        private string GetBaseRevision(string repository)
        {
            return _hgWrapper.GetLastPublicRevision(repository);
        }

        /// <summary> Mark all changesets available on the PT server public. </summary>
        private void MarkSharedChangeSetsPublic(string repository)
        {
            HgWrapper.RunCommand(repository, "phase -p -r 'tip'");
        }
    }
}
