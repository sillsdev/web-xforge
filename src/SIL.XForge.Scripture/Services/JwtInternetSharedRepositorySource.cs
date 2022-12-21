using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using Paratext;
using Paratext.Data;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Services;

/// <summary> An internet shared repository source that networks using JWT authenticated REST clients. </summary>
public class JwtInternetSharedRepositorySource : InternetSharedRepositorySource, IInternetSharedRepositorySource
{
    private readonly JwtRestClient _registryClient;
    private readonly IHgWrapper _hgWrapper;

    public JwtInternetSharedRepositorySource(
        string accessToken,
        JwtRestClient registryClient,
        IHgWrapper hgWrapper,
        ParatextUser authenticationPtUser,
        string srServerUri
    ) : base(authenticationPtUser, srServerUri)
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

    public InternetSharedRepositorySource AsInternetSharedRepositorySource() => this;

    public bool CanUserAuthenticateToPTArchives()
    {
        try
        {
            GetClient().Get("listrepos");
            return true;
        }
        catch (Paratext.Data.HttpException)
        {
            return false;
        }
    }

    /// <summary>
    /// Uses the a REST client to pull from the Paratext send/receive server. This overrides the base implementation
    /// to avoid needing the current user's Paratext registration code to get the base revision.
    /// </summary>
    public override string[] Pull(string repository, SharedRepository pullRepo)
    {
        string baseRev = _hgWrapper.GetLastPublicRevision(repository);

        // Get bundle
        string guid = Guid.NewGuid().ToString();
        List<string> query = new List<string>
        {
            "guid",
            guid,
            "proj",
            pullRepo.ScrTextName,
            "projid",
            pullRepo.SendReceiveId.Id,
            "type",
            "zstd-v2"
        };
        if (baseRev != null)
        {
            query.Add("base1");
            query.Add(baseRev);
        }

        byte[] bundle = client.GetStreaming("pullbundle", query.ToArray());
        // Finish bundle
        client.Get("pullbundlefinish", "guid", guid);
        if (bundle.Length == 0)
            return Array.Empty<string>();

        // Use bundle
        string[] changeSets = HgWrapper.Pull(repository, bundle);

        _hgWrapper.MarkSharedChangeSetsPublic(repository);
        return changeSets;
    }

    /// <summary>
    /// Uses the a REST client to push to the Paratext send/receive server. This overrides the base implementation
    /// to avoid needing the current user's Paratext registration code to get the base revision.
    /// </summary>
    public override void Push(string repository, SharedRepository pushRepo)
    {
        string baseRev = _hgWrapper.GetLastPublicRevision(repository);

        // Create bundle
        byte[] bundle = HgWrapper.Bundle(repository, baseRev);
        if (bundle.Length == 0)
            return;

        // Send bundle
        string guid = Guid.NewGuid().ToString();
        client.PostStreaming(
            bundle,
            "pushbundle",
            "guid",
            guid,
            "proj",
            pushRepo.ScrTextName,
            "projid",
            pushRepo.SendReceiveId.Id,
            "registered",
            "yes",
            "userschanged",
            "no"
        );

        _hgWrapper.MarkSharedChangeSetsPublic(repository);
    }

    /// <summary>
    /// This looks like it would be important, but it doesn't seem to matter what it returns, to synchronize.
    /// </summary>
    public override string GetHgUri(SharedRepository sharedRepository) => string.Empty;

    /// <summary>
    /// Retrieve a list of <see cref="SharedRepository" />.
    /// </summary>
    public override IEnumerable<SharedRepository> GetRepositories() => GetRepositories(GetLicensesForUserProjects());

    /// <summary>
    /// Gets the metadata information for all projects that the current user is on.
    /// Sourced from <see cref="RegistryServer" />.
    /// </summary>
    public IEnumerable<ProjectMetadata> GetProjectsMetaData()
    {
        JArray projects = GetJsonArray("my/projects");
        return projects?.Select(p => new ProjectMetadata((JObject)p)).ToList();
    }

    /// <remarks>Helps unit tests</remarks>
    public virtual RESTClient GetClient() => client;

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
        foreach (JObject license in licenses.Cast<JObject>())
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
}
