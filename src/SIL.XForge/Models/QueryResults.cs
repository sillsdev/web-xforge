using System.Collections.Generic;

namespace SIL.XForge.Models;

/// <summary>
/// The results of a paginated query of the MongoDB database.
/// </summary>
/// <typeparam name="T">The document type.</typeparam>
/// <remarks>
/// Be sure that your query uses indexes, otherwise the performance will be poor.
/// </remarks>
public class QueryResults<T>
    where T : class
{
    /// <summary>
    /// An empty query results set.
    /// </summary>
    public static QueryResults<T> Empty { get; } = new QueryResults<T> { Results = new List<T>(), UnpagedCount = 0L };

    /// <summary>
    /// The documents returned by the query.
    /// </summary>
    public required IEnumerable<T> Results { get; init; }

    /// <summary>
    /// The number of documents that would have been returned if the query was not paginated.
    /// </summary>
    public required long UnpagedCount { get; init; }
}
