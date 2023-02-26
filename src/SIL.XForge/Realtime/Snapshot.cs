namespace SIL.XForge.Realtime;

/// <summary>
/// A snapshot of a document of type <typeparamref name="T"/>.
/// </summary>
/// <typeparam name="T">The document type.</typeparam>
public class Snapshot<T>
{
    /// <summary>
    /// The document identifier.
    /// </summary>
    /// <remarks>
    /// This may be used to ensure that a snapshot returned is for a specific document.
    /// </remarks>
    public string Id { get; set; }

    /// <summary>
    /// The snapshot version.
    /// </summary>
    public int Version { get; set; }

    /// <summary>
    /// The snapshot data.
    /// </summary>
    public T Data { get; set; }
}
