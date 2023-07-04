using System;
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
    public async Task IsMp3DataAsync_EmptyStream()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(Array.Empty<byte>());

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.False(result);
    }

    [Test]
    public async Task IsMp3DataAsync_InvalidData()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(new byte[] { 0x44, 0x2E, 0x56, 0x2E });

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.False(result);
    }

    [Test]
    public async Task IsMp3DataAsync_StreamTooShort()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(new byte[] { 0xFF, 0xFF });

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.False(result);
    }

    [Test]
    public async Task IsMp3DataAsync_NullStream()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(new byte[] { 0x0, 0x0, 0x0, 0x0 });

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.False(result);
    }

    [Test]
    public async Task IsMp3DataAsync_MP3WithIDv3()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(new byte[] { 0x49, 0x44, 0x33, 0x03 });

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.True(result);
    }

    [Test]
    public async Task IsMp3DataAsync_MP3WithFFE()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(new byte[] { 0xFF, 0xEB, 0x10, 0x0 });

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.True(result);
    }

    [Test]
    public async Task IsMp3DataAsync_MP3WithFFF()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(new byte[] { 0xFF, 0xF3, 0x28, 0xC4 });

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.True(result);
    }

    [Test]
    public async Task IsMp3DataAsync_MP3WithNullHeader()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(new byte[] { 0x0, 0x0, 0x0, 0xFF, 0xF3, 0x28, 0xC4 });

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.True(result);
    }

    [Test]
    public async Task IsMp3DataAsync_ResetsStreamPosition()
    {
        var env = new TestEnvironment();
        await using var stream = new MemoryStream(new byte[] { 0x49, 0x44, 0x33, 0x0 });

        // SUT
        var result = await env.Service.IsMp3DataAsync(stream);
        Assert.True(result);
        Assert.Zero(stream.Position);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            IOptions<AudioOptions> audioOptions = Substitute.For<IOptions<AudioOptions>>();
            Service = new AudioService(audioOptions);
        }

        public AudioService Service { get; }
    }
}
