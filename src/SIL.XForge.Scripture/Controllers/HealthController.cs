using System;
using System.Diagnostics;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
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
[AllowAnonymous]
public class HealthController(
    IOptions<AuthOptions> authOptions,
    IExceptionHandler exceptionHandler,
    IRealtimeService realtimeService
) : ControllerBase
{
    public const int Status531MongoDown = 531;
    public const int Status532RealtimeServerDown = 532;

    /// <summary>
    /// Executes the health check.
    /// </summary>
    /// <param name="apiKey">The API key to access this endpoint.</param>
    /// <returns>A JSON object containing values corresponding to the health of various systems.</returns>
    /// <response code="200">All systems are healthy.</response>
    /// <response code="403">You do not have permission to view the health check.</response>
    /// <response code="531">Mongo is down.</response>
    /// <response code="532">The Realtime Server is down.</response>
    [HttpPost]
    public async Task<ActionResult<HealthCheckResponse>> HealthCheckAsync(
        [FromHeader(Name = "X-Api-Key")] string apiKey
    )
    {
        // Restrict this endpoint to requests with the correct API key
        if (authOptions.Value.HealthCheckApiKey != apiKey)
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
            project = await realtimeService.QuerySnapshots<SFProject>().FirstOrDefaultAsync();
            stopWatch.Stop();
            response.Mongo.Up = project is not null;
            response.Mongo.Time = stopWatch.ElapsedMilliseconds;
            response.Mongo.Status = response.Mongo.Up ? "Success" : "Retrieved project is null";
        }
        catch (Exception e)
        {
            response.Mongo.Status = e.Message;
            exceptionHandler.ReportException(e);
        }

        // Second, check the realtime server
        if (project is not null)
        {
            try
            {
                stopWatch = Stopwatch.StartNew();
                await using IConnection conn = await realtimeService.ConnectAsync();
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
                exceptionHandler.ReportException(e);
            }
        }
        else
        {
            response.RealtimeServer.Status = "The project was not retrieved from Mongo";
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
        else
        {
            return Ok(response);
        }

        return StatusCode(statusCode, response);
    }
}
