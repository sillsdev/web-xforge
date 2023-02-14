using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using SIL.Machine.WebApi;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Provides an interface to the Build endpoints of the Machine API Translation Engine.
/// </summary>
public class MachineBuildService : MachineServiceBase, IMachineBuildService
{
    private readonly IExceptionHandler _exceptionHandler;

    public MachineBuildService(IExceptionHandler exceptionHandler, IHttpClientFactory httpClientFactory)
        : base(httpClientFactory) => _exceptionHandler = exceptionHandler;

    public async Task CancelCurrentBuildAsync(string translationEngineId, CancellationToken cancellationToken)
    {
        ValidateId(translationEngineId);

        string requestUri = $"translation-engines/{translationEngineId}/current-build/cancel";
        using var response = await MachineClient.PostAsync(requestUri, content: null, cancellationToken);

        // A 200 HTTP status code is returned whether there is a job currently running or not
        await _exceptionHandler.EnsureSuccessStatusCode(response);
    }

    public async Task<BuildDto?> GetBuildAsync(
        string translationEngineId,
        string buildId,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        ValidateId(translationEngineId);
        ValidateId(buildId);

        string requestUri = $"translation-engines/{translationEngineId}/builds/{buildId}";
        return await GetBuildAsync(requestUri, minRevision, cancellationToken);
    }

    public async Task<BuildDto?> GetCurrentBuildAsync(
        string translationEngineId,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        ValidateId(translationEngineId);

        string requestUri = $"translation-engines/{translationEngineId}/current-build";
        return await GetBuildAsync(requestUri, minRevision, cancellationToken);
    }

    public async Task<BuildDto> StartBuildAsync(string translationEngineId, CancellationToken cancellationToken)
    {
        ValidateId(translationEngineId);

        string requestUri = $"translation-engines/{translationEngineId}/builds";
        using var response = await MachineClient.PostAsync(requestUri, content: null, cancellationToken);
        await _exceptionHandler.EnsureSuccessStatusCode(response);

        // Return the build job information
        try
        {
            BuildDto? build = await response.Content.ReadFromJsonAsync<BuildDto>(Options, cancellationToken);
            if (build is null)
            {
                throw new InvalidDataException();
            }

            // The Machine 2.5.12 DTO requires this to be uppercase
            // Upgrading to a later version changes this to an enum
            // When this occurs, remove this line
            build.State = build.State.ToUpperInvariant();

            return build;
        }
        catch (Exception e)
        {
            throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
        }
    }

    private async Task<BuildDto?> GetBuildAsync(
        string requestUri,
        long? minRevision,
        CancellationToken cancellationToken
    )
    {
        if (minRevision.HasValue)
        {
            requestUri += $"?minRevision={minRevision}";
        }

        using var response = await MachineClient.GetAsync(requestUri, cancellationToken);

        // A 408 HTTP status code is returned if there is no build started/running within the timeout period
        if (response.StatusCode == HttpStatusCode.RequestTimeout)
        {
            // This is equivalent to 204 in the V1 API and represents EntityChangeType.None
            return null;
        }

        // No body is returned on a 204 HTTP status code
        if (response.StatusCode == HttpStatusCode.NoContent)
        {
            // This is equivalent to 404 in the V1 API and represents EntityChangeType.Delete
            throw new DataNotFoundException("Entity Deleted");
        }

        // Ensure we have a 2XX HTTP status code
        await _exceptionHandler.EnsureSuccessStatusCode(response);

        // Return the build job information
        try
        {
            BuildDto? build = await response.Content.ReadFromJsonAsync<BuildDto>(Options, cancellationToken);
            if (build is not null)
            {
                // The Machine 2.5.12 DTO requires this to be uppercase
                // Upgrading to a later version changes this to an enum
                // When this occurs, remove this block
                build.State = build.State.ToUpperInvariant();
            }

            return build;
        }
        catch (Exception e)
        {
            throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
        }
    }
}
