using System.IO;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services;

[TestFixture]
internal class AudioServiceTests
{
    [Test]
    public async Task IsMp3FileAsync_EmptyStream()
    {
        var env = new TestEnvironment();
        const string path = "file.mp3";
        await using var stream = new MemoryStream([]);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(stream);

        // SUT
        var result = await env.Service.IsMp3FileAsync(path);
        Assert.False(result);
    }

    [Test]
    public async Task IsMp3FileAsync_InvalidData()
    {
        var env = new TestEnvironment();
        const string path = "file.mp3";
        await using var stream = new MemoryStream([0x44, 0x2E, 0x56, 0x2E]);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(stream);

        // SUT
        var result = await env.Service.IsMp3FileAsync(path);
        Assert.False(result);
    }

    [Test]
    public async Task IsMp3FileAsync_StreamTooShort()
    {
        var env = new TestEnvironment();
        const string path = "file.mp3";
        await using var stream = new MemoryStream([0xFF, 0xFF]);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(stream);

        // SUT
        var result = await env.Service.IsMp3FileAsync(path);
        Assert.False(result);
    }

    [Test]
    public async Task IsMp3FileAsync_NullStream()
    {
        var env = new TestEnvironment();
        const string path = "file.mp3";
        await using var stream = new MemoryStream([0x0, 0x0, 0x0, 0x0]);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(stream);

        // SUT
        var result = await env.Service.IsMp3FileAsync(path);
        Assert.False(result);
    }

    [Test]
    public async Task IsMp3FileAsync_MP3WithIDv3()
    {
        var env = new TestEnvironment();
        const string path = "file.mp3";
        await using var stream = new MemoryStream([0x49, 0x44, 0x33, 0x03]);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(stream);

        // SUT
        var result = await env.Service.IsMp3FileAsync(path);
        Assert.True(result);
    }

    [Test]
    public async Task IsMp3FileAsync_MP3WithFFE()
    {
        var env = new TestEnvironment();
        const string path = "file.mp3";
        await using var stream = new MemoryStream([0xFF, 0xEB, 0x10, 0x0]);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(stream);

        // SUT
        var result = await env.Service.IsMp3FileAsync(path);
        Assert.True(result);
    }

    [Test]
    public async Task IsMp3FileAsync_MP3WithFFF()
    {
        var env = new TestEnvironment();
        const string path = "file.mp3";
        await using var stream = new MemoryStream([0xFF, 0xF3, 0x28, 0xC4]);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(stream);

        // SUT
        var result = await env.Service.IsMp3FileAsync(path);
        Assert.True(result);
    }

    [Test]
    public async Task IsMp3FileAsync_MP3WithNullHeader()
    {
        var env = new TestEnvironment();
        const string path = "file.mp3";
        await using var stream = new MemoryStream([0x0, 0x0, 0x0, 0xFF, 0xF3, 0x28, 0xC4]);
        env.FileSystemService.OpenFile(path, FileMode.Open).Returns(stream);

        // SUT
        var result = await env.Service.IsMp3FileAsync(path);
        Assert.True(result);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            IOptions<AudioOptions> audioOptions = Substitute.For<IOptions<AudioOptions>>();
            FileSystemService = Substitute.For<IFileSystemService>();
            Service = new AudioService(audioOptions, FileSystemService);
        }

        public IFileSystemService FileSystemService { get; }
        public AudioService Service { get; }
    }
}
