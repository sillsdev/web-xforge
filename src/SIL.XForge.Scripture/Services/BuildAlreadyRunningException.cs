using System;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// A draft build is already queued or running for the project.
/// </summary>
/// <param name="message">The error message.</param>
public class BuildAlreadyRunningException(string message) : Exception(message);
