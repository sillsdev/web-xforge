using System;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// An error with the Paratext user's refresh token, which means that the user cannot be authenticated at this time.
/// </summary>
public class ParatextTokenExpiredException : Exception
{
    private const string DefaultMessage = "The Paratext refresh token has expired.";

    public ParatextTokenExpiredException(string? message = DefaultMessage)
        : base(message) { }

    public ParatextTokenExpiredException(Exception innerException)
        : base(DefaultMessage, innerException) { }
}
