using System;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;

namespace SIL.XForge.Services;

[TestFixture]
public class S3StorageProviderTests
{
    private const string Bucket = AudioService.DirectoryName;
    private const string Project01 = "project01";
    private const string FileName = "filename.txt";
    private static AmazonS3Exception Forbidden =>
        new AmazonS3Exception("Access denied") { StatusCode = HttpStatusCode.Forbidden };
    private static AmazonS3Exception NotFound =>
        new AmazonS3Exception("Not found") { StatusCode = HttpStatusCode.NotFound };

    [Test]
    public async Task DeleteDirectoryAsync_DeletesFilesInDirectory()
    {
        var env = new TestEnvironment();
        env.AmazonS3.ListObjectsV2Async(Arg.Any<ListObjectsV2Request>())
            .Returns(
                Task.FromResult(
                    new ListObjectsV2Response
                    {
                        S3Objects =
                        [
                            new S3Object { Key = $"{Project01}/file1.txt" },
                            new S3Object { Key = $"{Project01}/file2.txt" },
                            new S3Object { Key = $"{Project01}/subdirectory/" },
                        ],
                    }
                )
            );
        env.AmazonS3.DeleteObjectAsync(Arg.Any<string>(), Arg.Any<string>())
            .Returns(Task.FromResult(new DeleteObjectResponse()));

        // SUT
        await env.Service.DeleteDirectoryAsync(Bucket, Project01);

        await env
            .AmazonS3.Received(1)
            .ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.BucketName == Bucket && r.Prefix == $"{Project01}/")
            );
        await env.AmazonS3.Received(1).DeleteObjectAsync(Bucket, $"{Project01}/file1.txt");
        await env.AmazonS3.Received(1).DeleteObjectAsync(Bucket, $"{Project01}/file2.txt");
        await env.AmazonS3.DidNotReceive().DeleteObjectAsync(Bucket, $"{Project01}/subdirectory/");
    }

    [Test]
    public async Task DeleteDirectoryAsync_DoesNotThrowWhenDirectoryDoesNotExist()
    {
        var env = new TestEnvironment();
        env.AmazonS3.ListObjectsV2Async(Arg.Any<ListObjectsV2Request>()).ThrowsAsync(NotFound);

        // SUT
        await Assert.DoesNotThrowAsync(() => env.Service.DeleteDirectoryAsync(Bucket, Project01));

        await env.AmazonS3.DidNotReceive().DeleteObjectAsync(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task DeleteDirectoryAsync_ContinuesWhenFileDoesNotExist()
    {
        var env = new TestEnvironment();
        env.AmazonS3.ListObjectsV2Async(Arg.Any<ListObjectsV2Request>())
            .Returns(
                Task.FromResult(
                    new ListObjectsV2Response
                    {
                        S3Objects =
                        [
                            new S3Object { Key = $"{Project01}/missing.txt" },
                            new S3Object { Key = $"{Project01}/existing.txt" },
                        ],
                    }
                )
            );
        env.AmazonS3.DeleteObjectAsync(Bucket, $"{Project01}/missing.txt").ThrowsAsync(NotFound);
        env.AmazonS3.DeleteObjectAsync(Bucket, $"{Project01}/existing.txt")
            .Returns(Task.FromResult(new DeleteObjectResponse()));

        // SUT
        await env.Service.DeleteDirectoryAsync(Bucket, Project01);

        await env.AmazonS3.Received(1).DeleteObjectAsync(Bucket, $"{Project01}/existing.txt");
    }

    [Test]
    public async Task DeleteDirectoryAsync_SanitizesPathComponents()
    {
        var env = new TestEnvironment();
        env.AmazonS3.ListObjectsV2Async(Arg.Any<ListObjectsV2Request>())
            .Returns(Task.FromResult(new ListObjectsV2Response { S3Objects = [] }));

        // SUT
        await env.Service.DeleteDirectoryAsync("bad/bucket", "bad/project");

        await env
            .AmazonS3.Received(1)
            .ListObjectsV2Async(
                Arg.Is<ListObjectsV2Request>(r => r.BucketName == "badbucket" && r.Prefix == "badproject/")
            );
    }

    [Test]
    public async Task DeleteDirectoryAsync_PropagatesUnexpectedErrors()
    {
        var env = new TestEnvironment();
        env.AmazonS3.ListObjectsV2Async(Arg.Any<ListObjectsV2Request>()).ThrowsAsync(Forbidden);

        // SUT
        await Assert.ThrowsAsync<AmazonS3Exception>(() => env.Service.DeleteDirectoryAsync(Bucket, Project01));
    }

    [Test]
    public async Task DeleteFileAsync_DeletesFile()
    {
        var env = new TestEnvironment();
        env.AmazonS3.DeleteObjectAsync(Bucket, $"{Project01}/{FileName}")
            .Returns(Task.FromResult(new DeleteObjectResponse()));

        // SUT
        await env.Service.DeleteFileAsync(Bucket, Project01, FileName);

        await env.AmazonS3.Received(1).DeleteObjectAsync(Bucket, $"{Project01}/{FileName}");
    }

    [Test]
    public async Task DeleteFileAsync_DoesNotThrowWhenFileDoesNotExist()
    {
        var env = new TestEnvironment();
        env.AmazonS3.DeleteObjectAsync(Bucket, $"{Project01}/{FileName}").ThrowsAsync(NotFound);

        // SUT
        await Assert.DoesNotThrowAsync(async () => await env.Service.DeleteFileAsync(Bucket, Project01, FileName));
    }

    [Test]
    public async Task DeleteFileAsync_SanitizesPathComponents()
    {
        var env = new TestEnvironment();
        env.AmazonS3.DeleteObjectAsync(Arg.Any<string>(), Arg.Any<string>())
            .Returns(Task.FromResult(new DeleteObjectResponse()));

        // SUT
        await env.Service.DeleteFileAsync("bad/bucket", "bad/project", "bad/file.txt");

        await env.AmazonS3.Received(1).DeleteObjectAsync("badbucket", "badproject/badfile.txt");
    }

    [Test]
    public async Task DeleteFileAsync_PropagatesUnexpectedErrors()
    {
        var env = new TestEnvironment();
        env.AmazonS3.DeleteObjectAsync(Bucket, $"{Project01}/{FileName}").ThrowsAsync(Forbidden);

        // SUT
        await Assert.ThrowsAsync<AmazonS3Exception>(() => env.Service.DeleteFileAsync(Bucket, Project01, FileName));
    }

    [Test]
    public async Task GetFileAsync_ReturnsFileStream()
    {
        var env = new TestEnvironment();
        using var expectedStream = new MemoryStream([1, 2, 3]);
        using var response = new GetObjectResponse();
        response.ResponseStream = expectedStream;
        env.AmazonS3.GetObjectAsync(Bucket, $"{Project01}/{FileName}").Returns(Task.FromResult(response));

        // SUT
        Stream result = await env.Service.GetFileAsync(Bucket, Project01, FileName);

        Assert.That(result, Is.SameAs(expectedStream));
        await env.AmazonS3.Received(1).GetObjectAsync(Bucket, $"{Project01}/{FileName}");
    }

    [Test]
    public async Task GetFileAsync_ThrowsWhenFileDoesNotExist()
    {
        var env = new TestEnvironment();
        env.AmazonS3.GetObjectAsync(Bucket, $"{Project01}/{FileName}").ThrowsAsync(NotFound);

        // SUT
        await Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.GetFileAsync(Bucket, Project01, FileName));
    }

    [Test]
    public async Task GetFileAsync_SanitizesPathComponents()
    {
        var env = new TestEnvironment();
        using var expectedStream = new MemoryStream();
        using var response = new GetObjectResponse();
        response.ResponseStream = expectedStream;
        env.AmazonS3.GetObjectAsync(Arg.Any<string>(), Arg.Any<string>()).Returns(Task.FromResult(response));

        // SUT
        await env.Service.GetFileAsync("bad/bucket", "bad/project", "bad/file.txt");

        await env.AmazonS3.Received(1).GetObjectAsync("badbucket", "badproject/badfile.txt");
    }

    [Test]
    public async Task GetFileAsync_PropagatesUnexpectedErrors()
    {
        var env = new TestEnvironment();
        env.AmazonS3.GetObjectAsync(Bucket, $"{Project01}/{FileName}").ThrowsAsync(Forbidden);

        // SUT
        await Assert.ThrowsAsync<AmazonS3Exception>(() => env.Service.GetFileAsync(Bucket, Project01, FileName));
    }

    [Test]
    public async Task PutFileAsync_UploadsFileAndReturnsUri()
    {
        var env = new TestEnvironment();
        await using var expectedStream = new NonDisposingMemoryStream();
        expectedStream.Write([1, 2, 3]);
        expectedStream.Seek(0, SeekOrigin.Begin);

        env.FileSystemService.OpenFile("source.txt", FileMode.Open).Returns(expectedStream);
        env.AmazonS3.PutObjectAsync(Arg.Any<PutObjectRequest>()).Returns(Task.FromResult(new PutObjectResponse()));

        // SUT
        Uri result = await env.Service.PutFileAsync("source.txt", Bucket, Project01, FileName);

        await env
            .AmazonS3.Received(1)
            .PutObjectAsync(
                Arg.Is<PutObjectRequest>(r =>
                    r.BucketName == Bucket
                    && r.Key == $"{Project01}/{FileName}"
                    && ReferenceEquals(r.InputStream, expectedStream)
                )
            );

        Assert.That(result.IsAbsoluteUri, Is.False);
        Assert.That(result.OriginalString, Does.StartWith($"/assets/{Bucket}/{Project01}/{FileName}?t="));
        expectedStream.ForceDispose();
    }

    [Test]
    public async Task PutFileAsync_SanitizesPathComponents()
    {
        var env = new TestEnvironment();
        await using var expectedStream = new NonDisposingMemoryStream();

        env.FileSystemService.OpenFile("source.txt", FileMode.Open).Returns(expectedStream);
        env.AmazonS3.PutObjectAsync(Arg.Any<PutObjectRequest>()).Returns(Task.FromResult(new PutObjectResponse()));

        // SUT
        Uri result = await env.Service.PutFileAsync("source.txt", "bad/bucket", "bad/project", "bad/file.txt");

        await env
            .AmazonS3.Received(1)
            .PutObjectAsync(
                Arg.Is<PutObjectRequest>(r =>
                    r.BucketName == "badbucket"
                    && r.Key == "badproject/badfile.txt"
                    && ReferenceEquals(r.InputStream, expectedStream)
                )
            );

        Assert.That(result.OriginalString, Does.StartWith("/assets/badbucket/badproject/badfile.txt?t="));
        expectedStream.ForceDispose();
    }

    [Test]
    public async Task PutFileAsync_PropagatesUploadErrors()
    {
        var env = new TestEnvironment();
        await using var expectedStream = new NonDisposingMemoryStream();

        env.FileSystemService.OpenFile("source.txt", FileMode.Open).Returns(expectedStream);
        env.AmazonS3.PutObjectAsync(Arg.Any<PutObjectRequest>()).ThrowsAsync(Forbidden);

        // SUT
        await Assert.ThrowsAsync<AmazonS3Exception>(() =>
            env.Service.PutFileAsync("source.txt", Bucket, Project01, FileName)
        );
        expectedStream.ForceDispose();
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            AmazonS3 = Substitute.For<IAmazonS3>();
            FileSystemService = Substitute.For<IFileSystemService>();
            Service = new S3StorageProvider(AmazonS3, FileSystemService);
        }

        public IAmazonS3 AmazonS3 { get; }
        public IFileSystemService FileSystemService { get; }
        public S3StorageProvider Service { get; }
    }
}
