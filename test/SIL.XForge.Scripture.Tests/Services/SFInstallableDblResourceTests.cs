using System;
using System.IO;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Threading.Tasks;
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
    public void ExtractAllAsync_WithDirectoryTraversalEntry_ThrowsInvalidOperation()
    {
        TestEnvironment env = new TestEnvironment();
        using MemoryStream zipStream = TestEnvironment.CreateZipStream("../evil.txt", "malicious");
        using ZipFile zip = new ZipFile(zipStream);
        zip.IsStreamOwner = false;

        InvalidOperationException exception = Assert.ThrowsAsync<InvalidOperationException>(async () =>
            await env.InvokeExtractAllAsync(zip, env.DestinationRoot)
        );

        Assert.That(exception.Message, Does.Contain("outside the extraction directory"));
        env.FileSystem.DidNotReceive().CreateFile(Arg.Any<string>());
        env.FileSystem.DidNotReceive().CreateDirectory(Arg.Any<string>());
    }

    /// <summary>
    /// Provides helpers for testing SFInstallableDblResource extraction safeguards.
    /// </summary>
    private sealed class TestEnvironment
    {
        private static readonly MethodInfo ExtractAllAsyncMethod =
            typeof(SFInstallableDblResource).GetMethod(
                "ExtractAllAsync",
                BindingFlags.Instance | BindingFlags.NonPublic
            ) ?? throw new InvalidOperationException("Failed to locate ExtractAllAsync method.");

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

            this.Resource = (SFInstallableDblResource)
                Activator.CreateInstance(
                    typeof(SFInstallableDblResource),
                    BindingFlags.Instance | BindingFlags.NonPublic,
                    null,
                    [
                        userSecret,
                        paratextOptions,
                        restClientFactory,
                        this.FileSystem,
                        jwtTokenHelper,
                        scrTextCollection,
                        projectDeleter,
                        migrationOperations,
                        passwordProvider,
                    ],
                    null
                );

            this.DestinationRoot = Path.Join(Path.GetTempPath(), "sf-dbl-extract-tests", Guid.NewGuid().ToString("N"));
        }

        public IFileSystemService FileSystem { get; }

        public SFInstallableDblResource Resource { get; }

        public string DestinationRoot { get; }

        public async Task InvokeExtractAllAsync(ZipFile zipFile, string destinationPath)
        {
            try
            {
                object result =
                    ExtractAllAsyncMethod.Invoke(this.Resource, [zipFile, destinationPath])
                    ?? throw new InvalidOperationException("ExtractAllAsync invocation returned null.");
                if (result is not Task extractionTask)
                {
                    throw new InvalidOperationException("ExtractAllAsync did not return a Task instance.");
                }

                await extractionTask.ConfigureAwait(false);
            }
            catch (TargetInvocationException exception) when (exception.InnerException != null)
            {
                ExceptionDispatchInfo.Capture(exception.InnerException).Throw();
            }
        }

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
