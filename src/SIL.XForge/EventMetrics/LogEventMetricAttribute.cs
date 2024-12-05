using System;

namespace SIL.XForge.EventMetrics;

/// <summary>
/// The method attribute to enable logging an event metric for a method.
/// </summary>
/// <param name="scope">The scope of the event.</param>
[AttributeUsage(AttributeTargets.Method)]
public class LogEventMetricAttribute(EventScope scope) : Attribute
{
    /// <summary>
    /// Gets or sets the event scope.
    /// </summary>
    public EventScope Scope { get; } = scope;
}
