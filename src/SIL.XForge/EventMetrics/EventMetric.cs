using System;
using System.Collections.Generic;
using MongoDB.Bson;
using SIL.XForge.Models;

namespace SIL.XForge.EventMetrics;

/// <summary>
/// An event that has been recorded from a user interaction or method execution.
/// </summary>
public class EventMetric : IIdentifiable
{
    /// <summary>
    /// Gets or sets the type of the event.
    /// </summary>
    /// <remarks>
    /// This will often correspond to the method name.
    /// </remarks>
    public string EventType { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the details of an exception that occurred executing the method (if it happened).
    /// </summary>
    public string? Exception { get; set; }

    /// <summary>
    /// Gets or sets the identifier.
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the event payload.
    /// </summary>
    /// <remarks>
    /// <para>If you are querying by projectId or userId, that will be done here.</para>
    /// <para>Your payload's properties should be normalized to lowerCamelCase.</para>
    /// </remarks>
    public Dictionary<string, BsonValue> Payload { get; set; } = [];

    /// <summary>
    /// Gets or sets the event project identifier.
    /// </summary>
    public string? ProjectId { get; set; }

    /// <summary>
    /// Gets or sets the result from the function that recorded this metric.
    /// </summary>
    public BsonValue? Result { get; set; }

    /// <summary>
    /// Gets or sets the scope of the event.
    /// </summary>
    /// <remarks>
    /// This will be used for filtering events.
    /// </remarks>
    public EventScope Scope { get; set; }

    /// <summary>
    /// Gets or sets the timestamp of the event in UTC.
    /// </summary>
    public DateTime TimeStamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Gets or sets the event user identifier.
    /// </summary>
    public string? UserId { get; set; }
}
