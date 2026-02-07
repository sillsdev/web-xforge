using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using ICSharpCode.SharpZipLib.Core;
using ICSharpCode.SharpZipLib.Zip;

namespace Zippy;

/// <summary>
/// Implements zip and unzip operations for the Zippy CLI.
/// </summary>
public sealed class ZipService
{
    public void CreateZip(string zipFilePath, IReadOnlyList<string> inputPaths)
    {
        ArgumentNullException.ThrowIfNullOrWhiteSpace(zipFilePath);
        ArgumentNullException.ThrowIfNull(inputPaths);

        if (inputPaths.Count == 0)
        {
            throw new ArgumentException("At least one input path is required.", nameof(inputPaths));
        }

        if (File.Exists(zipFilePath) || Directory.Exists(zipFilePath))
        {
            throw new IOException($"The zip file already exists: {zipFilePath}");
        }

        Dictionary<string, InputSource> plannedEntries = PlanZipEntries(inputPaths);

        string? outputDirectory = Path.GetDirectoryName(Path.GetFullPath(zipFilePath));
        if (!string.IsNullOrWhiteSpace(outputDirectory) && !Directory.Exists(outputDirectory))
        {
            Directory.CreateDirectory(outputDirectory);
        }

        using FileStream outputStream = new FileStream(
            zipFilePath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None
        );
        using var zipOutputStream = new ZipOutputStream(outputStream);
        zipOutputStream.IsStreamOwner = false;

        foreach (KeyValuePair<string, InputSource> entry in plannedEntries)
        {
            if (entry.Value.Kind == InputSourceKind.DirectoryMarker)
            {
                var dirEntry = new ZipEntry(entry.Key) { DateTime = DateTime.Now };
                zipOutputStream.PutNextEntry(dirEntry);
                zipOutputStream.CloseEntry();
                continue;
            }

            if (entry.Value.Kind != InputSourceKind.File)
            {
                throw new InvalidOperationException($"Unexpected entry kind: {entry.Value.Kind}");
            }

            var fileEntry = new ZipEntry(entry.Key) { DateTime = File.GetLastWriteTime(entry.Value.FilePath) };

            zipOutputStream.PutNextEntry(fileEntry);
            using FileStream inputStream = new FileStream(
                entry.Value.FilePath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read
            );
            StreamUtils.Copy(inputStream, zipOutputStream, new byte[8192]);
            zipOutputStream.CloseEntry();
        }

        zipOutputStream.Finish();
    }

    public void ExtractZipToCurrentDirectory(string zipFilePath)
    {
        ArgumentNullException.ThrowIfNullOrWhiteSpace(zipFilePath);

        if (!File.Exists(zipFilePath))
        {
            throw new FileNotFoundException("The zip file was not found.", zipFilePath);
        }

        string destinationRoot = Directory.GetCurrentDirectory();
        string destinationRootFullPath = EnsureTrailingSeparator(Path.GetFullPath(destinationRoot));

        using FileStream zipStream = new FileStream(zipFilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        using var zipFile = new ZipFile(zipStream);

        IReadOnlyList<PlannedExtraction> planned = PlanExtraction(zipFile, destinationRootFullPath);
        ValidateNoExtractionConflicts(planned);

        foreach (PlannedExtraction extraction in planned)
        {
            string destinationDirectory = Path.GetDirectoryName(extraction.DestinationPath) ?? destinationRootFullPath;
            if (!string.IsNullOrWhiteSpace(destinationDirectory) && !Directory.Exists(destinationDirectory))
            {
                Directory.CreateDirectory(destinationDirectory);
            }

            using Stream input = zipFile.GetInputStream(extraction.Entry);
            using FileStream output = new FileStream(
                extraction.DestinationPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None
            );
            input.CopyTo(output);
        }
    }

    private static Dictionary<string, InputSource> PlanZipEntries(IReadOnlyList<string> inputPaths)
    {
        var entries = new Dictionary<string, InputSource>(StringComparer.OrdinalIgnoreCase);

        foreach (string inputPath in inputPaths)
        {
            if (string.IsNullOrWhiteSpace(inputPath))
            {
                throw new ArgumentException("Input path items cannot be empty.", nameof(inputPaths));
            }

            string fullPath = Path.GetFullPath(inputPath);
            if (File.Exists(fullPath))
            {
                string fileName = Path.GetFileName(fullPath);
                if (string.IsNullOrWhiteSpace(fileName))
                {
                    throw new ArgumentException($"Unable to determine file name for: {inputPath}", nameof(inputPaths));
                }
                AddUnique(entries, NormalizeEntryName(fileName), InputSource.ForFile(fullPath));
            }
            else if (Directory.Exists(fullPath))
            {
                string dirName = Path.GetFileName(
                    fullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                );
                if (string.IsNullOrWhiteSpace(dirName))
                {
                    throw new ArgumentException(
                        $"Unable to determine directory name for: {inputPath}",
                        nameof(inputPaths)
                    );
                }

                AddUnique(entries, NormalizeEntryName(dirName) + "/", InputSource.ForDirectoryMarker());

                foreach (string file in Directory.EnumerateFiles(fullPath, "*", SearchOption.AllDirectories))
                {
                    string relativePath = Path.GetRelativePath(fullPath, file);
                    string entryName = NormalizeEntryName(Path.Combine(dirName, relativePath));
                    AddUnique(entries, entryName, InputSource.ForFile(file));
                }
            }
            else
            {
                throw new FileNotFoundException("Input path does not exist.", inputPath);
            }
        }

        return entries;
    }

    private static void AddUnique(Dictionary<string, InputSource> entries, string entryName, InputSource source)
    {
        if (entries.ContainsKey(entryName))
        {
            throw new ArgumentException($"Duplicate zip entry name: {entryName}");
        }

        entries.Add(entryName, source);
    }

    private static string NormalizeEntryName(string path)
    {
        string normalized = path.Replace(Path.DirectorySeparatorChar, '/').Replace(Path.AltDirectorySeparatorChar, '/');
        while (normalized.StartsWith("./", StringComparison.Ordinal))
        {
            normalized = normalized.Substring(2);
        }

        normalized = normalized.TrimStart('/');
        return normalized;
    }

    private static IReadOnlyList<PlannedExtraction> PlanExtraction(ZipFile zipFile, string destinationRootFullPath)
    {
        var planned = new List<PlannedExtraction>();

        foreach (ZipEntry entry in zipFile)
        {
            if (!entry.IsFile || string.IsNullOrWhiteSpace(entry.Name))
            {
                continue;
            }

            string destinationPath = GetSafeExtractionPath(destinationRootFullPath, entry.Name);
            planned.Add(new PlannedExtraction(entry, destinationPath));
        }

        return planned;
    }

    private static void ValidateNoExtractionConflicts(IReadOnlyList<PlannedExtraction> planned)
    {
        foreach (PlannedExtraction extraction in planned)
        {
            if (File.Exists(extraction.DestinationPath) || Directory.Exists(extraction.DestinationPath))
            {
                throw new IOException($"Refusing to overwrite existing path: {extraction.DestinationPath}");
            }

            string? directoryPath = Path.GetDirectoryName(extraction.DestinationPath);
            if (!string.IsNullOrWhiteSpace(directoryPath) && File.Exists(directoryPath))
            {
                throw new IOException($"Cannot create directory because a file exists: {directoryPath}");
            }
        }
    }

    private static string GetSafeExtractionPath(string destinationRootFullPath, string entryName)
    {
        string sanitizedEntryName = entryName.Replace('\\', '/');
        string combined = Path.GetFullPath(Path.Join(destinationRootFullPath, sanitizedEntryName));
        if (!combined.StartsWith(destinationRootFullPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException($"Zip entry is outside the destination directory: {entryName}");
        }

        return combined;
    }

    private static string EnsureTrailingSeparator(string path)
    {
        if (path.EndsWith(Path.DirectorySeparatorChar) || path.EndsWith(Path.AltDirectorySeparatorChar))
        {
            return path;
        }

        return path + Path.DirectorySeparatorChar;
    }

    private readonly record struct PlannedExtraction(ZipEntry Entry, string DestinationPath);

    private enum InputSourceKind
    {
        File,
        DirectoryMarker,
    }

    private readonly record struct InputSource(InputSourceKind Kind, string FilePath)
    {
        public static InputSource ForFile(string filePath) => new(InputSourceKind.File, filePath);

        public static InputSource ForDirectoryMarker() => new(InputSourceKind.DirectoryMarker, string.Empty);
    }
}
