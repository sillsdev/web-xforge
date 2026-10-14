using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;

namespace SIL.XForge.Services;

/// <summary>
/// Provides a storage provider implementation for Amazon S3
/// </summary>
/// <param name="amazonS3">The Amazon S3 client.</param>
/// <param name="fileSystemService">The file system service.</param>
public class S3StorageProvider(IAmazonS3 amazonS3, IFileSystemService fileSystemService) : IStorageProvider
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

    public async Task DeleteDirectoryAsync(string bucket, string projectId)
    {
        // Sanitize input
        bucket = SanitizeFileName(bucket);
        projectId = SanitizeFileName(projectId);

        try
        {
            var request = new ListObjectsV2Request { BucketName = bucket, Prefix = $"{projectId}/" };

            ListObjectsV2Response response = await amazonS3.ListObjectsV2Async(request);

            foreach (S3Object obj in (response.S3Objects ?? []).Where(obj => !obj.Key.EndsWith('/')))
            {
                try
                {
                    await amazonS3.DeleteObjectAsync(bucket, obj.Key);
                }
                catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
                {
                    // File does not exist
                }
            }
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            // Directory does not exist
        }
    }

    public async Task DeleteFileAsync(string bucket, string projectId, string fileName)
    {
        // Sanitize input
        bucket = SanitizeFileName(bucket);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);
        string key = $"{projectId}/{fileName}";

        try
        {
            await amazonS3.DeleteObjectAsync(bucket, key);
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            // File does not exist
        }
    }

    public async Task<Stream> GetFileAsync(string bucket, string projectId, string fileName)
    {
        // Sanitize input
        bucket = SanitizeFileName(bucket);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);
        string key = $"{projectId}/{fileName}";

        try
        {
            GetObjectResponse response = await amazonS3.GetObjectAsync(bucket, key);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            throw new DataNotFoundException($"{fileName} does not exist for {projectId} in {bucket}");
        }
    }

    public async Task<Uri> PutFileAsync(string path, string bucket, string projectId, string fileName)
    {
        // Sanitize input
        bucket = SanitizeFileName(bucket);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);

        await using var fileStream = fileSystemService.OpenFile(path, FileMode.Open);
        var request = new PutObjectRequest
        {
            BucketName = bucket,
            Key = $"{projectId}/{fileName}",
            InputStream = fileStream,
        };

        await amazonS3.PutObjectAsync(request);

        // Remove the old file from disk, as it is now on S3
        fileSystemService.DeleteFile(path);
        return new Uri($"/assets/{bucket}/{projectId}/{fileName}?t={DateTime.UtcNow.ToFileTime()}", UriKind.Relative);
    }

    private static string SanitizeFileName(string fileName) =>
        InvalidFileNameChars.Aggregate(fileName, (current, c) => current.Replace(c.ToString(), string.Empty));
}
