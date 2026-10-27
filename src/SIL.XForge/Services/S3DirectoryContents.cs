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
public class S3DirectoryContents(IAmazonS3 amazonS3, string bucketName, string directoryName, string subpath)
    : IDirectoryContents
{
    private readonly string _key = $"{directoryName}/{subpath}".TrimEnd('/') + '/';

    /// <inheritdoc />
    public bool Exists
    {
        get
        {
            try
            {
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
            Prefix = _key,
        };

        ListObjectsV2Response response;
        do
        {
            response = amazonS3.ListObjectsV2Async(request).GetAwaiter().GetResult();

            // Yield directories
            foreach (string prefix in response.CommonPrefixes)
            {
                yield return new S3FileInfo(amazonS3, bucketName, prefix);
            }

            // Yield files
            foreach (S3Object obj in response.S3Objects.Where(obj => obj.Key != _key))
            {
                yield return new S3FileInfo(amazonS3, bucketName, obj.Key);
            }

            // Set the continuation token for the next page
            request.ContinuationToken = response.NextContinuationToken;
        } while (response.IsTruncated == true);
    }

    /// <inheritdoc />
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}
