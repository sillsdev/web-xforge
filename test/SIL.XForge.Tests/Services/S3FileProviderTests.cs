using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using NSubstitute;
using NUnit.Framework;

namespace SIL.XForge.Services;

[TestFixture]
public class S3FileProviderTests
{
    [Test]
    public void GetFileAndCheckInformation_Success()
    {
        var env = new TestEnvironment();
        var fileInfo = env.Service.GetFileInfo("/dummy.pdf");

        Assert.That(fileInfo.Exists, Is.True);
        Assert.That(fileInfo.IsDirectory, Is.False);
        Assert.That(fileInfo.LastModified, Is.EqualTo(new DateTimeOffset(env.LastModified, TimeSpan.Zero)));
        Assert.That(fileInfo.Name, Is.EqualTo("dummy.pdf"));
        Assert.That(fileInfo.PhysicalPath, Is.Null);
        Assert.That(fileInfo.Length, Is.EqualTo(88929));
    }

    [Test]
    public void GetRootContents_Success()
    {
        var env = new TestEnvironment();
        var folderInfo = env.Service.GetDirectoryContents("/");

        Assert.That(folderInfo.Exists, Is.True);
        Assert.That(folderInfo.Count(), Is.EqualTo(2));
        Assert.That(folderInfo.Any(x => x.Name == "dummy.pdf"), Is.True);
        Assert.That(folderInfo.Any(x => x.Name == "folder-1"), Is.True);
    }

    [Test]
    public void GetContentsOfSubFolder_Success()
    {
        var env = new TestEnvironment();
        var folderInfo1 = env.Service.GetDirectoryContents("/folder-1");
        var folderInfo2 = env.Service.GetDirectoryContents("/folder-1/");

        Assert.That(folderInfo1.Exists, Is.True);
        Assert.That(folderInfo2.Exists, Is.True);

        Assert.That(folderInfo1.Count(), Is.EqualTo(4));
        Assert.That(folderInfo2.Count(), Is.EqualTo(4));

        Assert.That(folderInfo1.Any(x => x.Name == "folder-1-a"), Is.True);
        Assert.That(folderInfo2.Any(x => x.Name == "folder-1-a"), Is.True);
        Assert.That(folderInfo1.Any(x => x.Name == "folder-1-b"), Is.True);
        Assert.That(folderInfo2.Any(x => x.Name == "folder-1-b"), Is.True);
        Assert.That(folderInfo1.Any(x => x.Name == "aws.png"), Is.True);
        Assert.That(folderInfo2.Any(x => x.Name == "aws.png"), Is.True);
        Assert.That(folderInfo1.Any(x => x.Name == "dummy.pdf"), Is.True);
        Assert.That(folderInfo2.Any(x => x.Name == "dummy.pdf"), Is.True);
    }

    [Test]
    public void GetContentsOfEmptySubFolder_Success()
    {
        var env = new TestEnvironment();
        var folderInfo1 = env.Service.GetDirectoryContents("/folder-1/folder-1-b");
        var folderInfo2 = env.Service.GetDirectoryContents("/folder-1/folder-1-b/");

        Assert.That(folderInfo1.Exists, Is.True);
        Assert.That(folderInfo2.Exists, Is.True);

        Assert.That(folderInfo1.Count(), Is.Zero);
        Assert.That(folderInfo2.Count(), Is.Zero);
    }

    [Test]
    public void GetContentsOfNotExistingSubFolder_Success()
    {
        var env = new TestEnvironment();
        var folderInfo1 = env.Service.GetDirectoryContents("/folder-1-not-exists");
        var folderInfo2 = env.Service.GetDirectoryContents("/folder-1/folder-1-a/not-exists");
        var folderInfo3 = env.Service.GetDirectoryContents("/not-exists");

        Assert.That(folderInfo1.Exists, Is.False);
        Assert.That(folderInfo2.Exists, Is.False);
        Assert.That(folderInfo3.Exists, Is.False);

        Assert.That(folderInfo1.Count(), Is.Zero);
        Assert.That(folderInfo2.Count(), Is.Zero);
        Assert.That(folderInfo3.Count(), Is.Zero);
    }

    [Test]
    public void GetFileAndCheckContent_Success()
    {
        var env = new TestEnvironment();
        var fileInfo = env.Service.GetFileInfo("/folder-1/folder-1-a/ContentTest.txt");

        Assert.That(fileInfo.Exists, Is.True);

        using var textReader = new StreamReader(fileInfo.CreateReadStream());
        Assert.That(textReader.ReadToEnd(), Is.EqualTo("Test Data"));
    }

    private class TestEnvironment
    {
        public readonly DateTime LastModified = new DateTime(2017, 5, 13, 15, 25, 10, 0, DateTimeKind.Utc);

        public TestEnvironment()
        {
            const string bucketName = "bucket";
            IAmazonS3 amazonS3 = Substitute.For<IAmazonS3>();

            amazonS3
                .GetObjectMetadataAsync(bucketName, Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(call =>
                {
                    string key = call.ArgAt<string>(1);
                    if (key is "folder-1/" or "folder-1/folder-1-b/")
                    {
                        return Task.FromResult(new GetObjectMetadataResponse());
                    }

                    throw new AmazonS3Exception("Not found") { StatusCode = HttpStatusCode.NotFound };
                });

            amazonS3
                .ListObjectsV2Async(Arg.Any<ListObjectsV2Request>(), Arg.Any<CancellationToken>())
                .Returns(call =>
                {
                    var request = call.Arg<ListObjectsV2Request>();

                    return Task.FromResult(
                        request.Prefix switch
                        {
                            "" => new ListObjectsV2Response
                            {
                                S3Objects = [new S3Object { Key = "dummy.pdf" }],
                                CommonPrefixes = ["folder-1/"],
                            },
                            "folder-1/" => new ListObjectsV2Response
                            {
                                S3Objects =
                                [
                                    new S3Object { Key = "folder-1/aws.png" },
                                    new S3Object { Key = "folder-1/dummy.pdf" },
                                ],
                                CommonPrefixes = ["folder-1/folder-1-a/", "folder-1/folder-1-b/"],
                            },
                            _ => new ListObjectsV2Response { S3Objects = [], CommonPrefixes = [] },
                        }
                    );
                });

            amazonS3
                .GetObjectAsync(bucketName, Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(call =>
                {
                    string key = call.ArgAt<string>(1);

                    var response = new GetObjectResponse
                    {
                        BucketName = bucketName,
                        Key = key,
                        LastModified = LastModified,
                        ResponseStream =
                            key == "folder-1/folder-1-a/ContentTest.txt"
                                ? new MemoryStream(Encoding.UTF8.GetBytes("Test Data"))
                                : new MemoryStream(),
                        ContentLength = key switch
                        {
                            "dummy.pdf" => 88929,
                            "folder-1/folder-1-a/ContentTest.txt" => 7,
                            _ => 0,
                        },
                    };

                    return Task.FromResult(response);
                });
            Service = new S3FileProvider(amazonS3, bucketName);
        }

        public S3FileProvider Service { get; }
    }
}
