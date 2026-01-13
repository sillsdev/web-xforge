using ICSharpCode.SharpZipLib.Zip;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Extension methods for zip files.
/// </summary>
public static class ZipEntryExtensions
{
    /// <summary>
    /// Determines if the zip entry is a symbolic link.
    /// </summary>
    /// <param name="entry">The zip entry</param>
    /// <returns><c>true</c> if the zip entry is a symbolic link; otherwise, <c>false</c>.</returns>
    public static bool IsSymLink(this ZipEntry entry) => ((entry.ExternalFileAttributes >> 16) & 0xF000) == 0xA000;
}
