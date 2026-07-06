using System;

namespace SIL.XForge.Services;

/// <summary>
/// A rate limit has been exceeded.
/// </summary>
/// <param name="message">The error message.</param>
public class LimitExceededException(string message) : Exception(message);
