using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Security;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.FeatureManagement;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods for authentication of anonymous users.
/// </summary>
[Route(UrlConstants.Anonymous)]
[ApiController]
[AllowAnonymous]
public class AnonymousController(
    IAnonymousService anonymousService,
    IExceptionHandler exceptionHandler,
    IFeatureManager featureManager,
    IMachineApiService machineApiService
) : ControllerBase
{
    /// <summary>
    /// Checks whether the share key is valid.
    /// </summary>
    /// <param name="content">The share key to check.</param>
    /// <response code="200">The share key is valid.</response>
    /// <response code="404">The share key is invalid or not found.</response>
    [HttpPost("checkShareKey")]
    public async Task<ActionResult<AnonymousShareKeyResponse>> CheckShareKey([FromBody] CheckShareKeyRequest content)
    {
        try
        {
            return Ok(await anonymousService.CheckShareKey(content.ShareKey));
        }
        catch (DataNotFoundException e)
        {
            return NotFound(e.Message);
        }
        catch (ForbiddenException e)
        {
            return NotFound(e.Message);
        }
        catch (Exception)
        {
            exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "CheckShareKey" }, { "shareKey", content.ShareKey } }
            );
            throw;
        }
    }

    /// <summary>
    /// Gets the feature flags.
    /// </summary>
    /// <returns>The feature flags as a dictionary.</returns>
    /// <response code="200">The feature flags were successfully retrieved.</response>
    [HttpGet("featureFlags")]
    public async Task<ActionResult<Dictionary<string, bool>>> FeatureFlags()
    {
        Dictionary<string, bool> features = [];
        await foreach (string feature in featureManager.GetFeatureNamesAsync())
        {
            features.Add(feature, await featureManager.IsEnabledAsync(feature));
        }

        // Stop JSON.NET overriding the dictionary key casing
        return new JsonResult(
            features,
            new JsonSerializerSettings
            {
                ContractResolver = new DefaultContractResolver
                {
                    NamingStrategy = new CamelCaseNamingStrategy { ProcessDictionaryKeys = false },
                },
            }
        );
    }

    /// <summary>
    /// Generates an anonymous account.
    /// </summary>
    /// <param name="request">The parameters to generate the account.</param>
    /// <returns><c>true</c> on success.</returns>
    /// <response code="200">The account was generated.</response>
    /// <response code="204">There was a problem communicating with the authentication server.</response>
    /// <response code="404">The share key does not exist.</response>
    [HttpPost("generateAccount")]
    public async Task<ActionResult<bool>> GenerateAccount([FromBody] GenerateAccountRequest request)
    {
        exceptionHandler.RecordEndpointInfoForException(
            new Dictionary<string, string>
            {
                { "method", "GenerateAccount" },
                { "shareKey", request.ShareKey },
                { "displayName", request.DisplayName },
                { "language", request.Language },
            }
        );
        try
        {
            var credentials = await anonymousService.GenerateAccount(
                request.ShareKey,
                request.DisplayName,
                request.Language
            );
            // Store credentials in a cookie as a fallback to the auth0 tokens expiring so the user can log in again
            Response.Cookies.Append(
                CookieConstants.TransparentAuthentication,
                JsonConvert.SerializeObject(credentials),
                new CookieOptions { Expires = DateTimeOffset.UtcNow.AddYears(2) }
            );
            return Ok(true);
        }
        catch (DataNotFoundException e)
        {
            return NotFound(e.Message);
        }
        catch (HttpRequestException e)
        {
            exceptionHandler.ReportException(e);
            return NoContent();
        }
        catch (TaskCanceledException e)
        {
            exceptionHandler.ReportException(e);
            return NoContent();
        }
        catch (SecurityException e)
        {
            exceptionHandler.ReportException(e);
            return NoContent();
        }
    }

    /// <summary>
    /// Executes a webhook callback.
    /// </summary>
    /// <param name="_">The json data containing the event and the payload.</param>
    /// <param name="signature">The SHA256 signature for the payload.</param>
    /// <returns><c>true</c> on success.</returns>
    /// <response code="200">The webhook was executed.</response>
    /// <response code="204">There was a problem executing the webhook.</response>
    /// <remarks>Serval requires a Success code, even on failure, so we return </remarks>
    [HttpPost("webhook")]
    public async Task<ActionResult<bool>> Webhook(
        [FromHeader(Name = "X-Hub-Signature-256")] string signature,
        [BindNever, FromBody] object? _ = null
    )
    {
        // NOTE: The discard parameter is so that Swagger can allow us to enter a Request body, and so we can read the
        // Request.Body stream in this action. If we did not read the body in this way and set BindNever, we would not
        // be able to get the JSON data as sent by Serval from the Request Body, and validate the HMAC signature.
        try
        {
            // Get the json as a raw string form the body so that we can validate the signature
            using var reader = new StreamReader(Request.Body, Encoding.UTF8);
            string json = await reader.ReadToEndAsync();
            await machineApiService.ExecuteWebhookAsync(json, signature);
            return Ok(true);
        }
        catch (Exception e)
        {
            // Report the exception, but do not throw it as Serval requires a success code
            exceptionHandler.ReportException(e);
            return NoContent();
        }
    }
}
