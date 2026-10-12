using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.FileProviders;

namespace SIL.XForge.Services;

/// <summary>
/// Contents of a S3 directory. Files are the keys prefixed by given 'path'.
/// </summary>
public class S3DirectoryContents(IAmazonS3 amazonS3, string bucketName, string subpath) : IDirectoryContents
{
    private readonly string _key = subpath.TrimEnd('/') + '/';

    private bool IsRoot => _key == "/";

    /// <inheritdoc />
    public bool Exists
    {
        get
        {
            try
            {
                // Root folder always exists
                if (IsRoot)
                    return true;
                amazonS3.GetObjectMetadataAsync(bucketName, _key).GetAwaiter().GetResult();
                return true;
            }
            catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
            {
                return false;
            }
        }
    }

    /// <inheritdoc />
    public IEnumerator<IFileInfo> GetEnumerator()
    {
        var request = new ListObjectsV2Request
        {
            BucketName = bucketName,
            Delimiter = "/",
            Prefix = IsRoot ? string.Empty : _key,
        };
        var response = amazonS3.ListObjectsV2Async(request).GetAwaiter().GetResult();

        IEnumerable<S3FileInfo> files = response
            .S3Objects.Where(x => x.Key != _key)
            .Select(x => new S3FileInfo(amazonS3, bucketName, x.Key));

        IEnumerable<S3FileInfo> directories = response.CommonPrefixes.Select(x => new S3FileInfo(
            amazonS3,
            bucketName,
            x
        ));

        return directories.Concat(files).GetEnumerator();
    }

    /// <inheritdoc />
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}
