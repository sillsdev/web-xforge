using System.Collections.Generic;
using Microsoft.AspNetCore.Http;
using Serval.Client;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Sample exceptions as returned by Serval.
/// </summary>
/// <remarks>These have been constructed based on the information in Swagger.</remarks>
public static class ServalApiExceptions
{
    public static ServalApiException BuildInProgress =>
        new ServalApiException(
            "There is already an active or pending build or a build in the process of being canceled",
            StatusCodes.Status409Conflict,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );

    public static ServalApiException EngineNotBuilt =>
        new ServalApiException(
            "The engine needs to be built first",
            StatusCodes.Status409Conflict,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );

    public static ServalApiException Forbidden =>
        new ServalApiException(
            "The authenticated client does not own the translation engine.",
            StatusCodes.Status403Forbidden,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );

    public static ServalApiException InternalServerError =>
        new ServalApiException(
            "The HTTP status code of the response was not expected (500).",
            StatusCodes.Status500InternalServerError,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );

    public static ServalApiException NoContent =>
        new ServalApiException(
            "There is no build currently running.",
            StatusCodes.Status204NoContent,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );

    public static ServalApiException NotAuthenticated =>
        new ServalApiException(
            "The client is not authenticated.",
            StatusCodes.Status401Unauthorized,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );

    public static ServalApiException NotFound =>
        new ServalApiException(
            "The build does not exist.",
            StatusCodes.Status404NotFound,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );

    public static ServalApiException NotSupported =>
        new ServalApiException(
            "The translation engine does not support cancelling builds.",
            StatusCodes.Status405MethodNotAllowed,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );

    public static ServalApiException TimeOut =>
        new ServalApiException(
            "The long polling request timed out.",
            StatusCodes.Status408RequestTimeout,
            null,
            new Dictionary<string, IEnumerable<string>>(),
            null
        );
}
