#nullable disable warnings
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using Paratext;
using Paratext.Data;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// An internet shared repository source that networks using JWT authenticated REST clients.
/// </summary>
public class JwtInternetSharedRepositorySource : InternetSharedRepositorySource, IInternetSharedRepositorySource
{
    private readonly JwtRestClient _registryClient;
    private readonly IHgWrapper _hgWrapper;
    private readonly ILogger _logger;
    private readonly int _maxJsonLogChars = 200;

    public JwtInternetSharedRepositorySource(
        string accessToken,
        JwtRestClient registryClient,
        IHgWrapper hgWrapper,
        ParatextUser authenticationPtUser,
        string srServerUri,
        ILogger logger
    )
        : base(authenticationPtUser, srServerUri)
    {
        _registryClient = registryClient;
        _hgWrapper = hgWrapper;
        _logger = logger;
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
    public override string[] Pull(string repositoryPath, SharedRepository pullRepo)
    {
        string baseRev = _hgWrapper.GetLastPublicRevision(repositoryPath);

        // Get bundle
        string guid = Guid.NewGuid().ToString();
        List<string> query =
        [
            "guid",
            guid,
            "proj",
            pullRepo.ScrTextName,
            "projid",
            pullRepo.SendReceiveId.Id,
            "type",
            "zstd-v2",
        ];
        if (baseRev != null)
        {
            query.Add("base1");
            query.Add(baseRev);
        }

        byte[] bundle = client.GetStreaming("pullbundle", [.. query]);
        // Finish bundle
        client.Get("pullbundlefinish", "guid", guid);
        if (bundle.Length == 0)
            return [];

        // Use bundle
        string[] changeSets = _hgWrapper.Pull(repositoryPath, bundle);

        _hgWrapper.MarkSharedChangeSetsPublic(repositoryPath);
        return changeSets;
    }

    /// <summary>
    /// Uses the a REST client to push to the Paratext send/receive server. This overrides the base implementation
    /// to avoid needing the current user's Paratext registration code to get the base revision.
    /// </summary>
    public override void Push(string repositoryPath, SharedRepository pushRepo)
    {
        string baseRev = _hgWrapper.GetLastPublicRevision(repositoryPath);

        // Create bundle
        byte[] bundle = _hgWrapper.Bundle(repositoryPath, baseRev);
        if (bundle.Length == 0)
        {
            _logger.LogInformation($"Not pushing a 0 Byte bundle for project PT ID {pushRepo.SendReceiveId.Id}.");
            return;
        }

        string localTip = _hgWrapper.GetRepoRevision(repositoryPath);
        _logger.LogInformation(
            $"Pushing bundle of {bundle.Length} Bytes to S/R server for project PT ID "
                + $"{pushRepo.SendReceiveId.Id}. Base revision {baseRev ?? "(null)"}. Local tip {localTip}."
        );

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

        (bool isRevOnServer, int serverRevCount, string? serverLastRev) = CheckIfRevisionIsOnServer(pushRepo, localTip);
        if (!isRevOnServer)
        {
            throw new InvalidOperationException(
                $"Push verification failed for project PT ID {pushRepo.SendReceiveId.Id}. "
                    + $"Expected revision {localTip} was not found in the server's revision history. "
                    + $"Server has {serverRevCount} revisions. Last server revision: {serverLastRev ?? "(null)"}."
            );
        }

        _hgWrapper.MarkSharedChangeSetsPublic(repositoryPath);
    }

    /// <summary>
    /// Returns whether the expected revision is present on the Paratext Send/Receive server.
    /// </summary>
    internal (bool isRevOnServer, int serverRevCount, string? serverLastRev) CheckIfRevisionIsOnServer(
        SharedRepository serverRepo,
        string expectedRevision
    )
    {
        string projRevHistResponse = GetClient()
            .Get("projrevhist", "proj", serverRepo.ScrTextName, "projid", serverRepo.SendReceiveId.Id, "all", "1");

        JObject jsonResult = JObject.Parse(projRevHistResponse);
        if (jsonResult["project"]?["revision_history"]?["revisions"] is not JArray revisions)
        {
            string truncatedResult = FormatAndTruncate(jsonResult, _maxJsonLogChars);
            _logger.LogWarning(
                $"Getting projrevhist unexpectedly received null revisions for PT project ID {serverRepo.SendReceiveId.Id}. The JSON result is: {truncatedResult}"
            );
            return (false, 0, null);
        }

        bool isRevOnServer = revisions.Any(r =>
            string.Equals(r["id"]?.ToString(), expectedRevision, StringComparison.Ordinal)
        );
        int serverRevCount = revisions.Count;
        string? serverLastRev = GetFirstElementId(revisions);

        return (isRevOnServer, serverRevCount, serverLastRev);
    }

    /// <summary>
    /// Returns the first element's "id" value, if possible.
    /// </summary>
    private static string? GetFirstElementId(JArray revisions)
    {
        if (revisions.Count > 0)
            return revisions[0]["id"]?.ToString();
        return null;
    }

    /// <summary>
    /// Formats JSON and truncates if too long.
    /// </summary>
    private static string FormatAndTruncate(JObject jsonResult, int maxChars)
    {
        string prettyJson = jsonResult.ToString(Newtonsoft.Json.Formatting.Indented);
        return TruncateLogString(prettyJson, maxChars);
    }

    /// <summary>
    /// Truncates a string to the configured character count if needed and appends truncation details.
    /// </summary>
    private static string TruncateLogString(string value, int maxChars)
    {
        if (value.Length <= maxChars)
            return value;

        int truncatedChars = value.Length - maxChars;
        return value[..maxChars] + Environment.NewLine + $"... (truncated {truncatedChars} more characters)";
    }

    /// <summary>
    /// This looks like it would be important, but it doesn't seem to matter what it returns, to synchronize.
    /// </summary>
    public override string GetHgUri(SharedRepository sharedRepository) => string.Empty;

    /// <summary>
    /// Returns the ids of unpushed commits. Overriding here since InternetSharedRepositorySource.GetOutgoingRevisions
    /// is going to SharedRepositorySource.GetOutgoingRevisions which doesn't work for us because it needs to look at
    /// the remote repository. One difference with this implementation is that it looks at commit phase to determine
    /// what is pushed. Distinguishing between public and draft commit phase is not something ParatextData uses.
    /// </summary>
    public override string[] GetOutgoingRevisions(string repository, SharedProject sharedProject) =>
        _hgWrapper.GetDraftRevisions(repository);

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
        JArray projects = GetJson<JArray>("my/projects");
        return projects?.Select(p => new ProjectMetadata((JObject)p)).ToList();
    }

    /// <summary>
    /// Gets the licenses for the project if the current user is a member of it.
    /// Sourced from <see cref="RegistryServer" />.
    /// </summary>
    /// <param name="paratextId">The project's Paratext identifier.</param>
    /// <returns>
    /// The <see cref="ProjectLicense"/>, or <c>null</c> if it could not be found.
    /// </returns>
    /// <remarks>
    /// Null will typically be returned if a project uses another project's registration.
    /// </remarks>
    public ProjectLicense? GetLicenseForUserProject(string paratextId)
    {
        JObject? license = GetJson<JObject>($"projects/{paratextId}/license");
        if (license is null)
            return null;
        var projectLicense = new ProjectLicense(license);
        if (projectLicense.IsInvalid || projectLicense.IsExpired)
            return null;
        return projectLicense;
    }

    /// <summary>
    /// Gets the metadata for the project if the current user is a member of it.
    /// Sourced from <see cref="RegistryServer" />.
    /// </summary>
    /// <param name="paratextId">The project's Paratext identifier.</param>
    /// <returns>
    /// The <see cref="ProjectMetadata"/>, or <c>null</c> if it could not be found.
    /// </returns>
    /// <remarks>
    /// Null will typically be returned if a project uses another project's registration.
    /// </remarks>
    public ProjectMetadata? GetProjectMetadata(string paratextId)
    {
        JObject metadata = GetJson<JObject>($"projects/{paratextId}");
        if (metadata is null)
            return null;
        var projectMetadata = new ProjectMetadata(metadata);
        return projectMetadata;
    }

    /// <summary>Gets the client.</summary>
    /// <remarks>Helps unit tests</remarks>
    public virtual RESTClient GetClient() => client;

    /// <summary>
    /// Gets the licenses for all projects the current user is a member of.
    /// Sourced from <see cref="RegistryServer" />.
    /// </summary>
    private List<ProjectLicense> GetLicensesForUserProjects()
    {
        JArray licenses = GetJson<JArray>("my/licenses");
        if (licenses == null)
            return null;
        List<ProjectLicense> result = [];
        foreach (JObject license in licenses.Cast<JObject>())
        {
            var projLicense = new ProjectLicense(license);
            if (projLicense.IsInvalid || projLicense.IsExpired)
                continue;
            result.Add(projLicense);
        }
        return result;
    }

    private T? GetJson<T>(string cgiCall)
        where T : JToken
    {
        DateTime startTime = DateTime.UtcNow;
        string projectData;
        try
        {
            projectData = _registryClient.Get(cgiCall);
        }
        catch (HttpException ex) when (ex.Response.StatusCode == HttpStatusCode.NotFound)
        {
            _logger.LogInformation(
                $"external_api_request_timing pt_registry GET {cgiCall} returned 404 {(DateTime.UtcNow - startTime).Milliseconds} ms"
            );
            return null;
        }
        catch (HttpException e)
        {
            _logger.LogInformation(
                e,
                $"external_api_request_timing pt_registry GET {cgiCall} failed after {(DateTime.UtcNow - startTime).Milliseconds} ms"
            );
            throw;
        }
        _logger.LogInformation(
            $"external_api_request_timing pt_registry GET {cgiCall} took {(DateTime.UtcNow - startTime).Milliseconds} ms"
        );
        if (!string.IsNullOrEmpty(projectData) && !projectData.Equals("null", StringComparison.OrdinalIgnoreCase))
            return JToken.Parse(projectData) as T;
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
