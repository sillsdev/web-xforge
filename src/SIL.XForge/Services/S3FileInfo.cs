using System;
using System.IO;
using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.FileProviders;

namespace SIL.XForge.Services;

/// <summary>
/// Provides access to an S3 file for the <seealso cref="S3FileProvider"/>.
/// </summary>
public class S3FileInfo(IAmazonS3 amazonS3, string bucketName, string key) : IFileInfo
{
    private bool? _exists;
    private GetObjectResponse? _fileObject;

    /// <inheritdoc />
    public bool Exists
    {
        get
        {
            if (!_exists.HasValue)
            {
                try
                {
                    GetFileObject();
                    _exists = true;
                }
                catch (AmazonS3Exception e)
                {
                    if (e.StatusCode == HttpStatusCode.NotFound)
                        _exists = false;
                    throw;
                }
            }

            return _exists.Value;
        }
    }

    /// <inheritdoc />
    public long Length => GetFileObject().ContentLength;

    /// <inheritdoc />
    public string? PhysicalPath => null;

    /// <inheritdoc />
    public string Name => Path.GetFileName(GetFileObject().Key.TrimEnd('/'));

    /// <inheritdoc />
    public DateTimeOffset LastModified =>
        new DateTimeOffset(DateTime.SpecifyKind(GetFileObject().LastModified ?? DateTime.MinValue, DateTimeKind.Utc));

    /// <inheritdoc />
    public bool IsDirectory => GetFileObject().Key.EndsWith('/');

    /// <inheritdoc />
    public Stream CreateReadStream() => GetFileObject().ResponseStream;

    private GetObjectResponse GetFileObject()
    {
        _fileObject ??= amazonS3.GetObjectAsync(bucketName, key).GetAwaiter().GetResult();
        return _fileObject;
    }
}
