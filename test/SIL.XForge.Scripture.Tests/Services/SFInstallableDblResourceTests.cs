using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using ICSharpCode.SharpZipLib.Core;
using ICSharpCode.SharpZipLib.Zip;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data.Archiving;
using Paratext.Data.ProjectFileAccess;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Ensures the installable DBL resource extraction logic resists directory traversal entries.
/// </summary>
[TestFixture]
public sealed class SFInstallableDblResourceTests
{
    [Test]
    public async Task ExtractAllAsync_Success()
    {
        TestEnvironment env = new TestEnvironment();
        using MemoryStream zipStream = TestEnvironment.CreateZipStream(".dbl/dbl_id_here", string.Empty);
        using ZipFile zip = new ZipFile(zipStream);
        zip.IsStreamOwner = false;

        await env.Resource.ExtractAllAsync(zip, env.DestinationRoot);

        env.FileSystem.Received().CreateDirectory(Path.Combine(env.DestinationRoot, ".dbl"));
        env.FileSystem.Received().CreateFile(Path.Combine(env.DestinationRoot, ".dbl", "dbl_id_here"));
    }

    [Test]
    public void ExtractAllAsync_WithDirectoryTraversalEntry_ThrowsInvalidOperation()
    {
        TestEnvironment env = new TestEnvironment();
        using MemoryStream zipStream = TestEnvironment.CreateZipStream("../evil.txt", "malicious");
        using ZipFile zip = new ZipFile(zipStream);
        zip.IsStreamOwner = false;

        InvalidNameException exception = Assert.ThrowsAsync<InvalidNameException>(async () =>
            await env.Resource.ExtractAllAsync(zip, env.DestinationRoot)
        );

        Assert.That(exception.Message, Does.Contain("Parent traversal in paths is not allowed"));
        env.FileSystem.DidNotReceive().CreateDirectory(Arg.Any<string>());
        env.FileSystem.DidNotReceive().CreateFile(Arg.Any<string>());
    }

    /// <summary>
    /// Provides helpers for testing SFInstallableDblResource extraction safeguards.
    /// </summary>
    private sealed class TestEnvironment
    {
        public TestEnvironment()
        {
            UserSecret userSecret = new UserSecret { Id = "user1" };
            ParatextOptions paratextOptions = new ParatextOptions();
            ISFRestClientFactory restClientFactory = Substitute.For<ISFRestClientFactory>();
            IJwtTokenHelper jwtTokenHelper = Substitute.For<IJwtTokenHelper>();
            IScrTextCollection scrTextCollection = Substitute.For<IScrTextCollection>();
            IProjectDeleter projectDeleter = Substitute.For<IProjectDeleter>();
            IMigrationOperations migrationOperations = Substitute.For<IMigrationOperations>();
            IZippedResourcePasswordProvider passwordProvider = Substitute.For<IZippedResourcePasswordProvider>();

            this.FileSystem = Substitute.For<IFileSystemService>();
            this.FileSystem.FileExists(Arg.Any<string>()).Returns(false);
            this.FileSystem.CreateFile(Arg.Any<string>()).Returns(_ => new MemoryStream());

            this.Resource = new SFInstallableDblResource(
                userSecret,
                paratextOptions,
                restClientFactory,
                this.FileSystem,
                jwtTokenHelper,
                scrTextCollection,
                projectDeleter,
                migrationOperations,
                passwordProvider
            );

            this.DestinationRoot = Path.Join(Path.GetTempPath(), "sf-dbl-extract-tests", Guid.NewGuid().ToString("N"));
        }

        public IFileSystemService FileSystem { get; }

        public SFInstallableDblResource Resource { get; }

        public string DestinationRoot { get; }

        public static MemoryStream CreateZipStream(string entryName, string content)
        {
            MemoryStream stream = new MemoryStream();
            using ZipOutputStream zipStream = new ZipOutputStream(stream);
            zipStream.IsStreamOwner = false;
            ZipEntry entry = new ZipEntry(entryName);
            zipStream.PutNextEntry(entry);
            byte[] payload = Encoding.UTF8.GetBytes(content);
            zipStream.Write(payload, 0, payload.Length);
            zipStream.CloseEntry();
            zipStream.Finish();
            stream.Position = 0;
            return stream;
        }
    }
}
