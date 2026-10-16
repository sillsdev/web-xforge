using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services;

/// <summary>
/// Provides a storage provider implementation for the file system.
/// </summary>
/// <param name="fileSystemService">The file system service.</param>
/// <param name="siteOptions">The site options.</param>
public class FileSystemStorageProvider(IFileSystemService fileSystemService, IOptions<SiteOptions> siteOptions)
    : IStorageProvider
{
    public Task DeleteDirectoryAsync(string bucket, string projectId)
    {
        // Sanitize input
        bucket = SanitizeFileName(bucket);
        projectId = SanitizeFileName(projectId);

        // Delete the directory if it exists
        string directoryPath = Path.Join(siteOptions.Value.SiteDir, bucket, projectId);
        if (fileSystemService.DirectoryExists(directoryPath))
        {
            fileSystemService.DeleteDirectory(directoryPath);
        }

        return Task.CompletedTask;
    }

    public Task DeleteFileAsync(string bucket, string projectId, string fileName)
    {
        // Sanitize input
        bucket = SanitizeFileName(bucket);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);

        // Delete the file if it exists
        string filePath = Path.Join(siteOptions.Value.SiteDir, bucket, projectId, fileName);
        if (fileSystemService.FileExists(filePath))
        {
            fileSystemService.DeleteFile(filePath);
        }

        return Task.CompletedTask;
    }

    public Task<Stream> GetFileAsync(string bucket, string projectId, string fileName)
    {
        // Sanitize input
        bucket = SanitizeFileName(bucket);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);

        // If the file does not exist, throw an error
        string path = Path.Join(siteOptions.Value.SiteDir, bucket, projectId, fileName);
        if (!fileSystemService.FileExists(path))
        {
            throw new DataNotFoundException($"{fileName} does not exist for {projectId} in {bucket}");
        }

        return Task.FromResult(fileSystemService.OpenFile(path, FileMode.Open));
    }

    public Task<Uri> PutFileAsync(string path, string bucket, string projectId, string fileName)
    {
        // Sanitize input
        bucket = SanitizeFileName(bucket);
        projectId = SanitizeFileName(projectId);
        fileName = SanitizeFileName(fileName);

        // Create the file and directory paths
        string directoryPath = Path.Join(siteOptions.Value.SiteDir, bucket, projectId);
        string filePath = Path.Join(directoryPath, fileName);

        // If the file does not exist, throw an error
        if (!fileSystemService.FileExists(path))
        {
            throw new DataNotFoundException($"{fileName} does not exist for {projectId} in {bucket}");
        }

        // Create the destination directory if it does not already exist
        if (!fileSystemService.DirectoryExists(directoryPath))
        {
            fileSystemService.CreateDirectory(directoryPath);
        }

        // Delete the file if it already exists, and it is different to the path
        if (
            fileSystemService.FileExists(filePath)
            && !string.Equals(
                Path.GetFullPath(path),
                Path.GetFullPath(filePath),
                OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal
            )
        )
        {
            fileSystemService.DeleteFile(filePath);
        }

        // Move the file if it is not there already
        if (!fileSystemService.FileExists(filePath))
        {
            fileSystemService.MoveFile(path, filePath);
        }

        return Task.FromResult(
            new Uri($"/assets/{bucket}/{projectId}/{fileName}?t={DateTime.UtcNow.ToFileTime()}", UriKind.Relative)
        );
    }

    private static string SanitizeFileName(string fileName) =>
        Path.GetInvalidFileNameChars().Aggregate(fileName, (current, c) => current.Replace(c.ToString(), string.Empty));
}
