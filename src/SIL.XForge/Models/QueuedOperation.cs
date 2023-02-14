namespace SIL.XForge.Models;

/// <summary>
/// A queued operation.
/// </summary>
/// <remarks>
/// This is for use by <see cref="Realtime.QueuedRealtimeServer"/>.
/// </remarks>
internal class QueuedOperation
{
    /// <summary>
    /// Gets or sets the action.
    /// </summary>
    /// <value>
    /// The action.
    /// </value>
    /// <remarks>
    /// This corresponds to the function called on the realtime server.
    /// </remarks>
    public QueuedAction Action { get; set; }

    /// <summary>
    /// Gets or sets the collection.
    /// </summary>
    /// <value>
    /// The collection.
    /// </value>
    /// <remarks>
    /// This is specified for all queued operations.
    /// </remarks>
    public string Collection { get; set; }

    /// <summary>
    /// Gets or sets the data.
    /// </summary>
    /// <value>
    /// The data.
    /// </value>
    /// <remarks>
    /// This is required for <see cref="QueuedAction.Create" />.
    /// </remarks>
    public object Data { get; set; }

    /// <summary>
    /// Gets or sets the handle.
    /// </summary>
    /// <value>
    /// The handle.
    /// </value>
    /// <remarks>
    /// This is specified for all queued operations.
    /// </remarks>
    public int Handle { get; set; }

    /// <summary>
    /// Gets or sets the identifier.
    /// </summary>
    /// <value>
    /// The identifier.
    /// </value>
    /// <remarks>
    /// This is specified for all queued operations.
    /// </remarks>
    public string Id { get; set; }

    /// <summary>
    /// Gets or sets the operations.
    /// </summary>
    /// <value>
    /// The operations.
    /// </value>
    /// <remarks>
    /// Required for <see cref="QueuedAction.Submit" />.
    /// This is usually a collection of JSON0 or RichText operations.
    /// </remarks>
    public object Op { get; set; }

    /// <summary>
    /// Gets or sets the name of the ot type.
    /// </summary>
    /// <value>
    /// The name of the ot type.
    /// </value>
    /// <remarks>
    /// This is required for <see cref="QueuedAction.Create" />.
    /// See <see cref="Realtime.OTType" /> for allowed values.
    /// </remarks>
    public string OtTypeName { get; set; }
}
