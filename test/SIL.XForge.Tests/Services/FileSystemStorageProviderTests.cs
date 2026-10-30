using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using Options = Microsoft.Extensions.Options.Options;

namespace SIL.XForge.Services;

[TestFixture]
public class FileSystemStorageProviderTests
{
    private const string DirectoryName = AudioService.DirectoryName;
    private const string Project01 = "project01";
    private const string FileName = "filename.txt";

    [Test]
    public async Task DeleteDirectoryAsync_DeletesExistingDirectory()
    {
        var env = new TestEnvironment();
        string path = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01);
        env.FileSystemService.DirectoryExists(path).Returns(true);

        // SUT
        await env.Service.DeleteDirectoryAsync(DirectoryName, Project01);

        env.FileSystemService.Received(1).DeleteDirectory(path);
    }

    [Test]
    public async Task DeleteDirectoryAsync_DoesNotDeleteMissingDirectory()
    {
        var env = new TestEnvironment();
        string path = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01);
        env.FileSystemService.DirectoryExists(path).Returns(false);

        // SUT
        await env.Service.DeleteDirectoryAsync(DirectoryName, Project01);

        env.FileSystemService.DidNotReceive().DeleteDirectory(Arg.Any<string>());
    }

    [Test]
    public async Task DeleteDirectoryAsync_SanitizesPathComponents()
    {
        var env = new TestEnvironment();
        string path = Path.Join(env.SiteOptions.Value.SiteDir, "baddirectory", "badproject");
        env.FileSystemService.DirectoryExists(path).Returns(true);

        // SUT
        await env.Service.DeleteDirectoryAsync("bad/directory", "bad/project");

        env.FileSystemService.Received(1).DeleteDirectory(path);
    }

    [Test]
    public async Task DeleteFileAsync_DeletesExistingFile()
    {
        var env = new TestEnvironment();
        string path = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01, FileName);
        env.FileSystemService.FileExists(path).Returns(true);

        // SUT
        await env.Service.DeleteFileAsync(DirectoryName, Project01, FileName);

        env.FileSystemService.Received(1).DeleteFile(path);
    }

    [Test]
    public async Task DeleteFileAsync_DoesNotDeleteMissingFile()
    {
        var env = new TestEnvironment();
        string path = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01, FileName);
        env.FileSystemService.FileExists(path).Returns(false);

        // SUT
        await env.Service.DeleteFileAsync(DirectoryName, Project01, FileName);

        env.FileSystemService.DidNotReceive().DeleteFile(Arg.Any<string>());
    }

    [Test]
    public async Task DeleteFileAsync_SanitizesPathComponents()
    {
        var env = new TestEnvironment();
        string path = Path.Join(env.SiteOptions.Value.SiteDir, "baddirectory", "badproject", "badfile.txt");
        env.FileSystemService.FileExists(path).Returns(true);

        // SUT
        await env.Service.DeleteFileAsync("bad/directory", "bad/project", "bad/file.txt");

        env.FileSystemService.Received(1).DeleteFile(path);
    }

    [Test]
    public async Task GetFileAsync_ReturnsOpenedFile()
    {
        var env = new TestEnvironment();
        string path = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01, FileName);
        using var expectedStream = new MemoryStream();

        env.FileSystemService.FileExists(path).Returns(true);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(expectedStream);

        // SUT
        Stream result = await env.Service.GetFileAsync(DirectoryName, Project01, FileName);

        Assert.That(result, Is.SameAs(expectedStream));
        env.FileSystemService.Received(1).OpenFile(path, FileMode.Open);
    }

    [Test]
    public async Task GetFileAsync_ThrowsWhenFileDoesNotExist()
    {
        var env = new TestEnvironment();
        string path = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01, FileName);
        env.FileSystemService.FileExists(path).Returns(false);

        // SUT
        await Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetFileAsync(DirectoryName, Project01, FileName)
        );

        env.FileSystemService.DidNotReceive().OpenFile(Arg.Any<string>(), Arg.Any<FileMode>());
    }

    [Test]
    public async Task MoveFileAsync_CreatesDirectoryAndMovesFile()
    {
        var env = new TestEnvironment();
        string sourcePath = Path.GetFullPath("source.txt");
        string directoryPath = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01);
        string destinationPath = Path.Join(directoryPath, FileName);

        bool destinationExists = false;

        env.FileSystemService.FileExists(sourcePath).Returns(true);
        env.FileSystemService.DirectoryExists(directoryPath).Returns(false);
        env.FileSystemService.FileExists(destinationPath).Returns(_ => destinationExists);
        env.FileSystemService.When(x => x.MoveFile(sourcePath, destinationPath)).Do(_ => destinationExists = true);

        // SUT
        Uri result = await env.Service.MoveFileAsync(sourcePath, DirectoryName, Project01, FileName);

        env.FileSystemService.Received(1).CreateDirectory(directoryPath);
        env.FileSystemService.Received(1).MoveFile(sourcePath, destinationPath);
        Assert.That(result.IsAbsoluteUri, Is.False);
        Assert.That(result.OriginalString, Does.StartWith($"/assets/{DirectoryName}/{Project01}/{FileName}?t="));
    }

    [Test]
    public async Task MoveFileAsync_DoesNotCreateExistingDirectory()
    {
        var env = new TestEnvironment();
        string sourcePath = Path.GetFullPath("source.txt");
        string directoryPath = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01);
        string destinationPath = Path.Join(directoryPath, FileName);

        bool destinationExists = false;

        env.FileSystemService.FileExists(sourcePath).Returns(true);
        env.FileSystemService.DirectoryExists(directoryPath).Returns(true);
        env.FileSystemService.FileExists(destinationPath).Returns(_ => destinationExists);
        env.FileSystemService.When(x => x.MoveFile(sourcePath, destinationPath)).Do(_ => destinationExists = true);

        // SUT
        await env.Service.MoveFileAsync(sourcePath, DirectoryName, Project01, FileName);

        env.FileSystemService.DidNotReceive().CreateDirectory(directoryPath);
        env.FileSystemService.Received(1).MoveFile(sourcePath, destinationPath);
    }

    [Test]
    public async Task MoveFileAsync_DeletesExistingDestinationBeforeMoving()
    {
        var env = new TestEnvironment();
        string sourcePath = Path.GetFullPath("source.txt");
        string directoryPath = Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01);
        string destinationPath = Path.Join(directoryPath, FileName);

        bool destinationExists = true;

        env.FileSystemService.FileExists(sourcePath).Returns(true);
        env.FileSystemService.DirectoryExists(directoryPath).Returns(true);
        env.FileSystemService.FileExists(destinationPath).Returns(_ => destinationExists);
        env.FileSystemService.When(x => x.DeleteFile(destinationPath)).Do(_ => destinationExists = false);
        env.FileSystemService.When(x => x.MoveFile(sourcePath, destinationPath)).Do(_ => destinationExists = true);

        // SUT
        await env.Service.MoveFileAsync(sourcePath, DirectoryName, Project01, FileName);

        env.FileSystemService.Received(1).DeleteFile(destinationPath);
        env.FileSystemService.Received(1).MoveFile(sourcePath, destinationPath);
    }

    [Test]
    public async Task MoveFileAsync_DoesNotMoveFileWhenSourceIsDestination()
    {
        var env = new TestEnvironment();
        string path = Path.GetFullPath(Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01, FileName));

        env.FileSystemService.FileExists(Arg.Any<string>()).Returns(true);
        env.FileSystemService.DirectoryExists(Path.Join(env.SiteOptions.Value.SiteDir, DirectoryName, Project01))
            .Returns(true);

        // SUT
        Uri result = await env.Service.MoveFileAsync(path, DirectoryName, Project01, FileName);

        env.FileSystemService.DidNotReceive().MoveFile(Arg.Any<string>(), Arg.Any<string>());
        env.FileSystemService.DidNotReceive().DeleteFile(Arg.Any<string>());
        Assert.That(result.IsAbsoluteUri, Is.False);
    }

    [Test]
    public async Task MoveFileAsync_ThrowsWhenSourceFileDoesNotExist()
    {
        var env = new TestEnvironment();
        string sourcePath = Path.GetFullPath("missing.txt");
        env.FileSystemService.FileExists(sourcePath).Returns(false);

        // SUT
        await Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.MoveFileAsync(sourcePath, DirectoryName, Project01, FileName)
        );
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            FileSystemService = Substitute.For<IFileSystemService>();
            SiteOptions = Options.Create(new SiteOptions { SiteDir = "/site" });
            Service = new FileSystemStorageProvider(FileSystemService, SiteOptions);
        }

        public IFileSystemService FileSystemService { get; }
        public IOptions<SiteOptions> SiteOptions { get; }
        public FileSystemStorageProvider Service { get; }
    }
}
