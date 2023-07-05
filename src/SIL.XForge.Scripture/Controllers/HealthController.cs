using System;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Serval.Client;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods for checking on instance health.
/// </summary>
/// <remarks>
/// This can only be accessed from localhost, and is designed for NodePing.
/// </remarks>
[Route("health-check")]
[ApiController]
public class HealthController : ControllerBase
{
    public const int Status531MongoDown = 531;
    public const int Status532RealtimeServerDown = 532;
    public const int Status533ServalDown = 533;

    private readonly IExceptionHandler _exceptionHandler;
    private readonly IRealtimeService _realtimeService;
    private readonly ITranslationEnginesClient _translationEnginesClient;

    public HealthController(
        IExceptionHandler exceptionHandler,
        IRealtimeService realtimeService,
        ITranslationEnginesClient translationEnginesClient
    )
    {
        _exceptionHandler = exceptionHandler;
        _realtimeService = realtimeService;
        _translationEnginesClient = translationEnginesClient;
    }

    /// <summary>
    /// Executes the health check.
    /// </summary>
    /// <returns>A JSON object containing values corresponding to the health of various systems.</returns>
    /// <response code="200">All systems are healthy.</response>
    /// <response code="403">You do not have permission to view the health check.</response>
    /// <response code="531">Mongo is down.</response>
    /// <response code="532">The Realtime Server is down.</response>
    /// <response code="533">Serval is down.</response>
    [HttpGet]
    public async Task<ActionResult<HealthCheckResponse>> HealthCheckAsync()
    {
        // Restrict this endpoint to local requests
        if (!IsLocal())
        {
            return Forbid();
        }

        // Create the object to return for the health check
        var response = new HealthCheckResponse();

        // First, check MongoDB
        Stopwatch stopWatch;
        SFProject? project = null;
        try
        {
            stopWatch = Stopwatch.StartNew();
            project = await _realtimeService.QuerySnapshots<SFProject>().FirstOrDefaultAsync();
            stopWatch.Stop();
            response.Mongo.Up = project is not null;
            response.Mongo.Time = stopWatch.ElapsedMilliseconds;
            response.Mongo.Status = response.Mongo.Up ? "Success" : "Retrieved project is null";
        }
        catch (Exception e)
        {
            response.Mongo.Status = e.Message;
            _exceptionHandler.ReportException(e);
        }

        // Second, check the realtime server
        if (project is not null)
        {
            try
            {
                stopWatch = Stopwatch.StartNew();
                await using IConnection conn = await _realtimeService.ConnectAsync();
                IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(project.Id);
                stopWatch.Stop();
                response.RealtimeServer.Up = projectDoc.IsLoaded;
                response.RealtimeServer.Time = stopWatch.ElapsedMilliseconds;
                response.RealtimeServer.Status = response.RealtimeServer.Up
                    ? "Success"
                    : "The project document was not loaded";
            }
            catch (Exception e)
            {
                response.RealtimeServer.Status = e.Message;
                _exceptionHandler.ReportException(e);
            }
        }
        else
        {
            response.RealtimeServer.Status = "The project was not retrieved from Mongo";
        }

        // Third, check Serval
        try
        {
            stopWatch = Stopwatch.StartNew();
            var translationEngines = await _translationEnginesClient.GetAllAsync();
            stopWatch.Stop();
            response.Serval.Up = translationEngines.Any();
            response.Serval.Time = stopWatch.ElapsedMilliseconds;
            response.Serval.Status = response.Serval.Up ? "Success" : "No translation engines were retrieved";
        }
        catch (Exception e)
        {
            response.Serval.Status = e.Message;
            _exceptionHandler.ReportException(e);
        }

        // Calculate the status code and return the results
        int statusCode;
        if (!response.Mongo.Up)
        {
            statusCode = Status531MongoDown;
        }
        else if (!response.RealtimeServer.Up)
        {
            statusCode = Status532RealtimeServerDown;
        }
        else if (!response.Serval.Up)
        {
            statusCode = Status533ServalDown;
        }
        else
        {
            return Ok(response);
        }

        return StatusCode(statusCode, response);
    }

    /// <summary>
    /// Returns if a request is from localhost.
    /// </summary>
    /// <returns><c>true</c> if the request is local; otherwise, <c>false</c>.</returns>
    /// <remarks>This check uses similar logic to Hangfire's dashboard.</remarks>
    private bool IsLocal()
    {
        // Get the local and remote IP addresses
        string remoteIp = HttpContext.Connection.RemoteIpAddress?.ToString();
        string localIp = HttpContext.Connection.LocalIpAddress?.ToString();

        // Assume not local if remote IP is unknown
        if (string.IsNullOrEmpty(remoteIp))
        {
            return false;
        }

        // See if localhost
        return remoteIp is "127.0.0.1" or "::1" || remoteIp == localIp;
    }
}
