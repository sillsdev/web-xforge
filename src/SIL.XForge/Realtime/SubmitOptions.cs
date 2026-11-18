using System;
using System.Linq.Expressions;

namespace SIL.XForge.Realtime;

/// <summary>
/// Options for submitting the op to the Realtime Server.
/// </summary>
public record SubmitOptions<T> : SubmitOptions
    where T : class
{
    /// <summary>
    /// Gets or sets the check to perform for the duplicate key.
    /// </summary>
    /// <value>The duplicate key check expression.</value>
    public required Expression<Func<T, bool>> DuplicateKeyCheck { get; init; }

    /// <summary>
    /// Gets or sets a value that indicates if an error is to be thrown on duplicate key.
    /// </summary>
    /// <value>
    /// <c>true</c> if duplicate key errors should throw an exception; otherwise if <c>false</c>,
    /// silently do not commit the op to the Realtime Server.
    /// </value>
    public bool ThrowOnDuplicateKey { get; init; }
}

/// <summary>
/// Options for submitting the op to the Realtime Server.
/// </summary>
public record SubmitOptions
{
    /// <summary>
    /// Gets or sets the source of the operation.
    /// </summary>
    /// <value>Optional. The operation's source.</value>
    /// <remarks>This is currently only used by text documents.</remarks>
    public OpSource? Source { get; init; }
}
