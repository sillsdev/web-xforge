using System;
using System.Collections.Generic;
using System.CommandLine;
using System.CommandLine.IO;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using ICSharpCode.SharpZipLib.Zip;
using NUnit.Framework;
using Zippy;

namespace Zippy.Tests;

[TestFixture]
public sealed class ZipServiceTests
{
    [Test]
    public void CreateZip_FlattensFilePathsAndRootsDirectories()
    {
        // Suppose the command is run as `zippy zip out.zip my-file.txt foo/some-file.txt baz/some-dir` in a directory containing:
        // - my-file.txt
        // - foo/some-file.txt
        // - baz/some-dir/my-file.txt
        // - baz/some-dir/sub/nested.txt
        // We should create a zip file with expected entries.
        string tempRoot = Directory.CreateTempSubdirectory("zippy-test-").FullName;
        try
        {
            string myFile = Path.Join(tempRoot, "my-file.txt");
            File.WriteAllText(myFile, "a");

            string fooDir = Path.Join(tempRoot, "foo");
            Directory.CreateDirectory(fooDir);
            string fooSomeFile = Path.Join(fooDir, "some-file.txt");
            File.WriteAllText(fooSomeFile, "b");

            string bazSomeDir = Path.Join(tempRoot, "baz", "some-dir");
            Directory.CreateDirectory(Path.Join(bazSomeDir, "sub"));
            File.WriteAllText(Path.Join(bazSomeDir, "inner.txt"), "c");
            File.WriteAllText(Path.Join(bazSomeDir, "sub", "nested.txt"), "d");

            string zipPath = Path.Join(tempRoot, "out.zip");

            var service = new ZipService();
            service.CreateZip(zipPath, new List<string> { myFile, fooSomeFile, bazSomeDir });

            using FileStream stream = File.OpenRead(zipPath);
            using var zip = new ZipFile(stream);
            List<string> entryNames = zip.Cast<ZipEntry>().Select(e => e.Name).ToList();

            Assert.That(entryNames, Does.Contain("my-file.txt"));
            Assert.That(entryNames, Does.Contain("some-file.txt"));
            Assert.That(entryNames, Does.Contain("some-dir/inner.txt"));
            Assert.That(entryNames, Does.Contain("some-dir/sub/nested.txt"));

            Assert.That(entryNames, Does.Not.Contain("foo/some-file.txt"));
            Assert.That(entryNames, Does.Not.Contain("baz/some-dir/inner.txt"));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Test]
    public void CreateZip_WhenZipAlreadyExists_Throws()
    {
        string tempRoot = Directory.CreateTempSubdirectory("zippy-test-").FullName;
        try
        {
            string zipPath = Path.Join(tempRoot, "out.zip");
            File.WriteAllText(zipPath, "already exists");

            string inputFile = Path.Join(tempRoot, "a.txt");
            File.WriteAllText(inputFile, "a");

            var service = new ZipService();
            Assert.Throws<IOException>(() => service.CreateZip(zipPath, new List<string> { inputFile }));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Test]
    public void CreateZip_WhenDuplicateEntryNames_Throws()
    {
        string tempRoot = Directory.CreateTempSubdirectory("zippy-test-").FullName;
        try
        {
            string dir1 = Path.Join(tempRoot, "one");
            string dir2 = Path.Join(tempRoot, "two");
            Directory.CreateDirectory(dir1);
            Directory.CreateDirectory(dir2);

            string file1 = Path.Join(dir1, "dup.txt");
            string file2 = Path.Join(dir2, "dup.txt");
            File.WriteAllText(file1, "a");
            File.WriteAllText(file2, "b");

            string zipPath = Path.Join(tempRoot, "out.zip");

            var service = new ZipService();
            Assert.Throws<ArgumentException>(() => service.CreateZip(zipPath, new List<string> { file1, file2 }));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Test]
    public void ExtractZipToCurrentDirectory_WhenFileExists_ThrowsAndDoesNotOverwrite()
    {
        string tempRoot = Directory.CreateTempSubdirectory("zippy-test-").FullName;
        string zipRoot = Directory.CreateTempSubdirectory("zippy-zip-").FullName;

        string originalCwd = Directory.GetCurrentDirectory();
        try
        {
            string existingPath = Path.Join(tempRoot, "a.txt");
            File.WriteAllText(existingPath, "original");

            string inputFile = Path.Join(zipRoot, "a.txt");
            File.WriteAllText(inputFile, "new");
            string zipPath = Path.Join(zipRoot, "out.zip");

            var service = new ZipService();
            service.CreateZip(zipPath, new List<string> { inputFile });

            Directory.SetCurrentDirectory(tempRoot);

            Assert.Throws<IOException>(() => service.ExtractZipToCurrentDirectory(zipPath));
            Assert.That(File.ReadAllText(existingPath), Is.EqualTo("original"));
        }
        finally
        {
            Directory.SetCurrentDirectory(originalCwd);
            Directory.Delete(tempRoot, true);
            Directory.Delete(zipRoot, true);
        }
    }
}
