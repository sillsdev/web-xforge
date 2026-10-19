using System;
using Amazon.S3;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;

namespace SIL.XForge.Services;

/// <summary>
/// Provides read-only access to S3 files for static file access.
/// </summary>
/// <remarks>
/// This is based on the implementation at <c>https://github.com/evorine/S3FileProvider</c>.
/// </remarks>
public class S3FileProvider(IAmazonS3 amazonS3, string bucketName, string directoryName) : IFileProvider
{
    /// <inheritdoc />
    public IDirectoryContents GetDirectoryContents(string subpath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subpath);
        if (HasInvalidFilePathChars(subpath))
            return NotFoundDirectoryContents.Singleton;

        // Relative paths starting with leading slashes are okay
        return new S3DirectoryContents(amazonS3, bucketName, directoryName, subpath.TrimStart('/'));
    }

    /// <inheritdoc />
    public IFileInfo GetFileInfo(string subpath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subpath);
        if (HasInvalidFilePathChars(subpath))
            return new NotFoundFileInfo(subpath);

        // Relative paths starting with leading slashes are okay
        subpath = subpath.TrimStart('/');

        if (string.IsNullOrWhiteSpace(subpath))
            return new NotFoundFileInfo(subpath);

        string key = $"{directoryName}/{subpath}";
        return new S3FileInfo(amazonS3, bucketName, key);
    }

    /// <summary>
    /// Watch is not supported.
    /// </summary>
    public IChangeToken Watch(string filter) => NullChangeToken.Singleton;

    private static bool HasInvalidFilePathChars(string path) =>
        path.IndexOfAny(S3StorageProvider.InvalidFilePathChars) != -1;
}
