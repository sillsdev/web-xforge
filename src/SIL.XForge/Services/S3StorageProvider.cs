using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services;

/// <summary>
/// Provides a storage provider implementation for Amazon S3
/// </summary>
/// <param name="amazonS3">The Amazon S3 client.</param>
/// <param name="fileSystemService">The file system service.</param>
public class S3StorageProvider(
    IAmazonS3 amazonS3,
    IFileSystemService fileSystemService,
    IOptions<StorageConfigOptions> storageConfigOptions
) : IStorageProvider
{
    public static readonly char[] InvalidFilePathChars =
    [
        '\\',
        '{',
        '}',
        '^',
        '%',
        '`',
        '[',
        ']',
        '\'',
        '"',
        '>',
        '<',
        '~',
        '#',
        '|',
        .. Enumerable.Range(128, 255).Select(x => (char)x),
    ];

    private static readonly char[] InvalidFileNameChars = [.. InvalidFilePathChars, .. Path.GetInvalidFileNameChars()];

    public async Task DeleteDirectoryAsync(string directoryName, string projectId)
    {
        // Sanitize input
        directoryName = SanitizeFileName(directoryName);
        projectId = SanitizeFileName(projectId);

        // Ensure that the bucket name is configured
        string? bucketName = storageConfigOptions.Value.S3Bucket;
        if (string.IsNullOrWhiteSpace(bucketName))
            throw new DataNotFoundException("The S3 bucket is not configured.");

        try
        {
            var request = new ListObjectsV2Request
            {
                BucketName = bucketName,
                Prefix = $"{directoryName}/{projectId}/",
            };

            ListObjectsV2Response response;
            do
            {
                response = await amazonS3.ListObjectsV2Async(request);

                // Filter out directory markers/folders so we only delete files
                List<KeyVersion> keysToDelete =
                [
                    .. (response.S3Objects ?? [])
                        .Where(obj => !obj.Key.EndsWith('/'))
                        .Select(obj => new KeyVersion { Key = obj.Key }),
                ];

                if (keysToDelete.Count > 0)
                {
                    var deleteRequest = new DeleteObjectsRequest { BucketName = bucketName, Objects = keysToDelete };
                    await amazonS3.DeleteObjectsAsync(deleteRequest);
                }

                // Set the continuation token for the next page
                request.ContinuationToken = response.NextContinuationToken;
            } while (response.IsTruncated == true);
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            // Directory does not exist
        }
    }

    public async Task DeleteFileAsync(string directoryName, string projectId, string fileName)
    {
        // Sanitize input
        directoryName = SanitizeFileName(directoryName);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);
        string key = $"{directoryName}/{projectId}/{fileName}";

        // Ensure that the bucket name is configured
        string? bucketName = storageConfigOptions.Value.S3Bucket;
        if (string.IsNullOrWhiteSpace(bucketName))
            throw new DataNotFoundException("The S3 bucket is not configured.");

        try
        {
            await amazonS3.DeleteObjectAsync(bucketName, key);
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            // File does not exist
        }
    }

    public async Task<Stream> GetFileAsync(string directoryName, string projectId, string fileName)
    {
        // Sanitize input
        directoryName = SanitizeFileName(directoryName);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);
        string key = $"{directoryName}/{projectId}/{fileName}";

        // Ensure that the bucket name is configured
        string? bucketName = storageConfigOptions.Value.S3Bucket;
        if (string.IsNullOrWhiteSpace(bucketName))
            throw new DataNotFoundException("The S3 bucket is not configured.");

        try
        {
            GetObjectResponse response = await amazonS3.GetObjectAsync(bucketName, key);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            throw new DataNotFoundException($"{fileName} does not exist for {projectId} in {directoryName}");
        }
    }

    public async Task<Uri> PutFileAsync(string path, string directoryName, string projectId, string fileName)
    {
        // Sanitize input
        directoryName = SanitizeFileName(directoryName);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);

        // Ensure that the bucket name is configured
        string? bucketName = storageConfigOptions.Value.S3Bucket;
        if (string.IsNullOrWhiteSpace(bucketName))
            throw new DataNotFoundException("The S3 bucket is not configured.");

        await using var fileStream = fileSystemService.OpenFile(path, FileMode.Open);
        var request = new PutObjectRequest
        {
            BucketName = bucketName,
            Key = $"{directoryName}/{projectId}/{fileName}",
            InputStream = fileStream,
            UseChunkEncoding = storageConfigOptions.Value.S3UseChunkEncoding,
        };

        await amazonS3.PutObjectAsync(request);

        // Remove the old file from disk, as it is now on S3
        fileSystemService.DeleteFile(path);
        return new Uri(
            $"/assets/{directoryName}/{projectId}/{fileName}?t={DateTime.UtcNow.ToFileTime()}",
            UriKind.Relative
        );
    }

    private static string SanitizeFileName(string fileName) =>
        InvalidFileNameChars.Aggregate(fileName, (current, c) => current.Replace(c.ToString(), string.Empty));
}
