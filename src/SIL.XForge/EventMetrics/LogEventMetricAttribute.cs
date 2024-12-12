using System;

namespace SIL.XForge.EventMetrics;

/// <summary>
/// The method attribute to enable logging an event metric for a method.
/// </summary>
/// <param name="scope">The scope of the event.</param>
/// <param name="userId">The name of the user identifier field to use. Defaults to "userId".</param>
/// <param name="projectId">The name of the project identifier field to use. Defaults to "projectId".</param>
[AttributeUsage(AttributeTargets.Method)]
public class LogEventMetricAttribute(EventScope scope, string userId = "userId", string projectId = "projectId")
    : Attribute
{
    /// <summary>
    /// Gets or sets the name of the project identifier field.
    /// </summary>
    public string ProjectId { get; } = projectId;

    /// <summary>
    /// Gets or sets the event scope.
    /// </summary>
    public EventScope Scope { get; } = scope;

    /// <summary>
    /// Gets or sets the name of the user identifier field.
    /// </summary>
    public string UserId { get; } = userId;
}
