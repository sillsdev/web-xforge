using System.Collections.Generic;
using System.IO;

namespace SIL.XForge.Services;

public class FileSystemService : IFileSystemService
{
    public Stream CreateFile(string path) => File.Create(path);

    public bool FileExists(string path) => File.Exists(path);

    public Stream OpenFile(string path, FileMode mode) => File.Open(path, mode);

    public string FileReadText(string path) => File.ReadAllText(path);

    public void DeleteFile(string path) => File.Delete(path);

    public void CreateDirectory(string path) => Directory.CreateDirectory(path);

    public bool DirectoryExists(string path) => Directory.Exists(path);

    public void MoveDirectory(string sourceDirPath, string targetDirPath) =>
        Directory.Move(sourceDirPath, targetDirPath);

    public void MoveFile(string sourceFilePath, string targetFilePath) => File.Move(sourceFilePath, targetFilePath);

    public void DeleteDirectory(string path) => Directory.Delete(path, true);

    public IEnumerable<string> EnumerateFiles(string path, string searchPattern = "*") =>
        Directory.EnumerateFiles(path, searchPattern);

    public IEnumerable<string> EnumerateDirectories(string path) => Directory.EnumerateDirectories(path);
}
