using System.Threading.Tasks;
using SIL.XForge.Realtime;

namespace SIL.XForge.Models;

/// <summary>
/// A queued operation with its type preserved for op submission
/// </summary>
/// <typeparam name="T">The type the op is to be performed on.</typeparam>
internal class QueuedOperation<T> : QueuedOperation
    where T : class
{
    /// <summary>
    /// Submits an operation to the realtime server using the specified type.
    /// </summary>
    /// <param name="realtimeServer">The realtime server instance.</param>
    /// <returns>An asynchronous task.</returns>
    public override Task SubmitOpAsync(IRealtimeServer realtimeServer) =>
        realtimeServer.SubmitOpAsync<T>(Handle, Collection, Id, Op!, Options);
}

/// <summary>
/// A queued operation.
/// </summary>
/// <remarks>
/// This is for use by <see cref="Connection"/>.
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
    public required QueuedAction Action { get; init; }

    /// <summary>
    /// Gets or sets the collection.
    /// </summary>
    /// <value>
    /// The collection.
    /// </value>
    /// <remarks>
    /// This is specified for all queued operations.
    /// </remarks>
    public required string Collection { get; init; }

    /// <summary>
    /// Gets or sets the data.
    /// </summary>
    /// <value>
    /// The data.
    /// </value>
    /// <remarks>
    /// This is required for <see cref="QueuedAction.Create" />.
    /// </remarks>
    public object? Data { get; init; }

    /// <summary>
    /// Gets or sets the handle.
    /// </summary>
    /// <value>
    /// The handle.
    /// </value>
    /// <remarks>
    /// This is specified for all queued operations.
    /// </remarks>
    public required int Handle { get; init; }

    /// <summary>
    /// Gets or sets the identifier.
    /// </summary>
    /// <value>
    /// The identifier.
    /// </value>
    /// <remarks>
    /// This is specified for all queued operations.
    /// </remarks>
    public required string Id { get; init; }

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
    public object? Op { get; init; }

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
    public string? OtTypeName { get; init; }

    /// <summary>
    /// Gets or sets the source of the op.
    /// </summary>
    /// <value>
    /// The op source.
    /// </value>
    /// <remarks>
    /// This is for <see cref="QueuedAction.Create"/>, <see cref="QueuedAction.Delete"/>,
    /// and <see cref="QueuedAction.Replace"/> operations.
    /// </remarks>
    public OpSource? Source { get; init; }

    /// <summary>
    /// Gets or sets the options for the op submission.
    /// </summary>
    /// <value>
    /// The op source.
    /// </value>
    /// <remarks>
    /// This is only for <see cref="QueuedAction.Submit"/> operations.
    /// </remarks>
    public SubmitOptions? Options { get; init; }

    /// <summary>
    /// Submits an operation to the realtime server using the object type.
    /// </summary>
    /// <param name="realtimeServer">The realtime server instance.</param>
    /// <returns>An asynchronous task.</returns>
    public virtual Task SubmitOpAsync(IRealtimeServer realtimeServer) =>
        realtimeServer.SubmitOpAsync<object>(Handle, Collection, Id, Op!, Options);
}
