using System;
using System.Text.Json.Serialization;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The subset of <see cref="SyncMetrics"/> that is displayed in the sync log on the sync page.
/// </summary>
/// <remarks>
/// The log entries and statistics are deliberately excluded, as they can be very large.
/// </remarks>
public class SyncMetricsDisplay
{
    public required string Id { get; init; }

    public DateTime DateQueued { get; set; }

    public DateTime? DateStarted { get; set; }

    public DateTime? DateFinished { get; set; }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public SyncStatus Status { get; set; }

    /// <summary>
    /// Gets or sets the id of the user who initiated the sync.
    /// </summary>
    public string? UserRef { get; set; }

    /// <summary>
    /// Gets or sets the details of the error that caused the sync to fail.
    /// </summary>
    /// <remarks>
    /// This is only populated for serval administrators and system administrators.
    /// </remarks>
    public string? ErrorDetails { get; set; }
}
