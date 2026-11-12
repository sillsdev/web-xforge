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
    private GetObjectMetadataResponse? _metadata;

    /// <inheritdoc />
    public bool Exists
    {
        get
        {
            if (!_exists.HasValue)
            {
                try
                {
                    GetObjectMetadata();
                    _exists = true;
                }
                catch (AmazonS3Exception e)
                {
                    if (e.StatusCode == HttpStatusCode.NotFound)
                    {
                        _exists = false;
                    }
                    else
                    {
                        throw;
                    }
                }
            }

            return _exists.Value;
        }
    }

    /// <inheritdoc />
    public long Length => GetObjectMetadata().ContentLength;

    /// <inheritdoc />
    public string? PhysicalPath => null;

    /// <inheritdoc />
    public string Name => Path.GetFileName(key.TrimEnd('/'));

    /// <inheritdoc />
    public DateTimeOffset LastModified =>
        new DateTimeOffset(
            DateTime.SpecifyKind(GetObjectMetadata().LastModified ?? DateTime.MinValue, DateTimeKind.Utc)
        );

    /// <inheritdoc />
    public bool IsDirectory => key.EndsWith('/');

    /// <inheritdoc />
    public Stream CreateReadStream()
    {
        // Copy to a memory stream to allow seeking,
        // as the HashStream the AWS SDK uses does not support seeking.
        using GetObjectResponse fileObject = amazonS3.GetObjectAsync(bucketName, key).GetAwaiter().GetResult();
        MemoryStream memStream = new MemoryStream();
        fileObject.ResponseStream.CopyTo(memStream);
        memStream.Seek(0, SeekOrigin.Begin);
        return memStream;
    }

    private GetObjectMetadataResponse GetObjectMetadata()
    {
        _metadata ??= amazonS3.GetObjectMetadataAsync(bucketName, key).GetAwaiter().GetResult();
        return _metadata;
    }
}
