using System;
using System.IO;
using System.Threading.Tasks;

namespace SIL.XForge.Services;

/// <summary>
/// The storage provider interface.
/// </summary>
public interface IStorageProvider
{
    /// <summary>
    /// Deletes a directory from the storage provider.
    /// </summary>
    /// <param name="directoryName">The name of the top level directory to store the file in. This usually refers to the service storing the file.</param>
    /// <param name="projectId">The identifier of the project whose directory in the top level directory is to be deleted.</param>
    /// <returns>An asynchronous task.</returns>
    Task DeleteDirectoryAsync(string directoryName, string projectId);

    /// <summary>
    /// Deletes a file from the storage provider.
    /// </summary>
    /// <param name="directoryName">The name of the top level directory to store the file in. This usually refers to the service storing the file.</param>
    /// <param name="projectId">The identifier of the project that owns the file.</param>
    /// <param name="fileName">The file name with no path information.</param>
    /// <returns>An asynchronous task.</returns>
    Task DeleteFileAsync(string directoryName, string projectId, string fileName);

    /// <summary>
    /// Gets a file from the storage provider.
    /// </summary>
    /// <param name="directoryName">The name of the top level directory to retrieve the file from. This usually refers to the service storing the file.</param>
    /// <param name="projectId">The identifier of the project that owns the file.</param>
    /// <param name="fileName">The file name with no path information.</param>
    /// <returns>A read-access stream to the file.</returns>
    Task<Stream> GetFileAsync(string directoryName, string projectId, string fileName);

    /// <summary>
    /// Puts a file into the storage provider.
    /// </summary>
    /// <param name="path">The path to the file to put in the directory. This file should be a temporary file path, and will be deleted.</param>
    /// <param name="directoryName">The name of the top level directory to store the file in. This usually refers to the service storing the file.</param>
    /// <param name="projectId">The identifier of the project that owns the file.</param>
    /// <param name="fileName">The file name with no path information.</param>
    /// <returns>The user accessible URL to the file.</returns>
    Task<Uri> PutFileAsync(string path, string directoryName, string projectId, string fileName);
}
