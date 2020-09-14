using System.Collections.Generic;
using System.IO;

namespace SIL.XForge.Services
{
    public class FileSystemService : IFileSystemService
    {
        public Stream CreateFile(string path)
        {
            return File.Create(path);
        }

        public bool FileExists(string path)
        {
            return File.Exists(path);
        }

        public Stream OpenFile(string path, FileMode mode)
        {
            return File.Open(path, mode);
        }

        public string FileReadText(string path)
        {
            return File.ReadAllText(path);
        }

        public void DeleteFile(string path)
        {
            File.Delete(path);
        }

        public void CreateDirectory(string path)
        {
            Directory.CreateDirectory(path);
        }

        public bool DirectoryExists(string path)
        {
            return Directory.Exists(path);
        }

        public void MoveDirectory(string sourceDirPath, string targetDirPath)
        {
            Directory.Move(sourceDirPath, targetDirPath);
        }

        public void DeleteDirectory(string path)
        {
            Directory.Delete(path, true);
        }

        public IEnumerable<string> EnumerateFiles(string path)
        {
            return Directory.EnumerateFiles(path);
        }

        public IEnumerable<string> EnumerateDirectories(string path)
        {
            return Directory.EnumerateDirectories(path);
        }
    }
}
