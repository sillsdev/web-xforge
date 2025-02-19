using System;
using Newtonsoft.Json;
using SIL.XForge.Realtime;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A revision of a document in ShareDB and/or Paratext.
/// </summary>
/// <remarks>
/// This is used as a DTO for the Machine and Paratext Web APIs.
/// </remarks>
public class DocumentRevision
{
    /// <summary>
    /// Gets the source of the revision, if known.
    /// </summary>
    /// <value>
    /// The source of the op/ops that comprise this revision.
    /// </value>
    /// <remarks>The source will be serialized as a string.</remarks>
    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public OpSource? Source { get; init; }

    /// <summary>
    /// Gets the timestamp at which the revision was made.
    /// </summary>
    /// <value>The timestamp in UTC.</value>
    public DateTime Timestamp { get; init; }

    /// <summary>
    /// Gets the identifier of the user who made the revision.
    /// </summary>
    /// <value>The user identifier.</value>
    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public string? UserId { get; init; }
}
