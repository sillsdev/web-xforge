using System.IO;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// A memory stream that must be manually disposed.
/// </summary>
/// <remarks>This is only for use if your memory stream will be closed by a stream writer.</remarks>
public sealed class NonDisposingMemoryStream : MemoryStream
{
    /// <inheritdoc />
    protected override void Dispose(bool disposing)
    {
        // If the stream is open, reset it to the start
        if (CanSeek)
        {
            Flush();
            Seek(0, SeekOrigin.Begin);
        }
    }

    /// <summary>
    /// Force the disposal of this object.
    /// </summary>
    public void ForceDispose() => base.Dispose(true);
}
