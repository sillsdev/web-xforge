using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Amazon;
using Amazon.S3;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services;

public class S3StorageProvider : IStorageProvider
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

    public static AmazonS3Client GetAmazonS3Client(StorageConfigOptions options)
    {
        // Load S3 configuration
        var config = new AmazonS3Config();
        if (!string.IsNullOrWhiteSpace(options.S3ServiceUrl))
        {
            config.ServiceURL = options.S3ServiceUrl;
            config.ForcePathStyle = true;
            config.UseHttp = options.S3ServiceUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase);
        }
        else
        {
            config.RegionEndpoint = RegionEndpoint.GetBySystemName(options.S3Region);
        }

        // Use the credentials in the AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
        return new AmazonS3Client(config);
    }

    public Task DeleteDirectoryAsync(string bucket, string projectId) => throw new NotImplementedException();

    public Task DeleteFileAsync(string bucket, string projectId, string fileName) =>
        throw new NotImplementedException();

    public Task<Stream> GetFileAsync(string bucket, string projectId, string fileName) =>
        throw new NotImplementedException();

    public Task<Uri> PutFileAsync(string path, string bucket, string projectId, string fileName) =>
        throw new NotImplementedException();

    public static string SanitizeFileName(string fileName) =>
        InvalidFileNameChars.Aggregate(fileName, (current, c) => current.Replace(c.ToString(), string.Empty));
}
