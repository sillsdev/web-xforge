using System.Collections.Generic;
using System.IO;

namespace SIL.XForge.Services;

public interface IFileSystemService
{
    Stream CreateFile(string path);
    bool FileExists(string path);
    Stream OpenFile(string path, FileMode mode);
    string FileReadText(string path);
    void DeleteFile(string path);
    void CreateDirectory(string path);
    bool DirectoryExists(string path);
    void DeleteDirectory(string path);
    void MoveDirectory(string sourceDirPath, string targetDirPath);
    void MoveFile(string sourceFilePath, string targetFilePath);
    IEnumerable<string> EnumerateFiles(string path, string searchPattern = "*");
    IEnumerable<string> EnumerateDirectories(string path);
}
