using System;
using System.Collections.Generic;
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
using SIL.ObjectModel;

namespace SIL.XForge.Services;

[TestFixture]
public class S3FileProviderTests
{
    [Test]
    public void GetFileAndCheckInformation_Success()
    {
        using var env = new TestEnvironment();
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
        using var env = new TestEnvironment();
        var folderInfo = env.Service.GetDirectoryContents("/");

        Assert.That(folderInfo.Exists, Is.True);
        Assert.That(folderInfo.Count(), Is.EqualTo(2));
        Assert.That(folderInfo.Any(x => x.Name == "dummy.pdf"), Is.True);
        Assert.That(folderInfo.Any(x => x.Name == "folder-1"), Is.True);
    }

    [Test]
    public void GetContentsOfSubFolder_Success()
    {
        using var env = new TestEnvironment();
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
        using var env = new TestEnvironment();
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
        using var env = new TestEnvironment();
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
        using var env = new TestEnvironment();
        var fileInfo = env.Service.GetFileInfo("/folder-1/folder-1-a/ContentTest.txt");

        Assert.That(fileInfo.Exists, Is.True);

        using var textReader = new StreamReader(fileInfo.CreateReadStream());
        Assert.That(textReader.ReadToEnd(), Is.EqualTo("Test Data"));
    }

    private class TestEnvironment : DisposableBase
    {
        public readonly DateTime LastModified = new DateTime(2017, 5, 13, 15, 25, 10, 0, DateTimeKind.Utc);
        private readonly List<GetObjectResponse> _getObjectResponses = [];

        public TestEnvironment()
        {
            const string bucketName = "bucket";
            const string directoryName = "directory";
            IAmazonS3 amazonS3 = Substitute.For<IAmazonS3>();

            amazonS3
                .GetObjectMetadataAsync(bucketName, Arg.Any<string>(), Arg.Any<CancellationToken>())
                .Returns(call =>
                {
                    string key = call.ArgAt<string>(1);
                    if (
                        key
                        is $"{directoryName}/"
                            or $"{directoryName}/folder-1/"
                            or $"{directoryName}/folder-1/folder-1-b/"
                    )
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
                            $"{directoryName}/" => new ListObjectsV2Response
                            {
                                S3Objects = [new S3Object { Key = $"{directoryName}/dummy.pdf" }],
                                CommonPrefixes = [$"{directoryName}/folder-1/"],
                            },
                            $"{directoryName}/folder-1/" => new ListObjectsV2Response
                            {
                                S3Objects =
                                [
                                    new S3Object { Key = $"{directoryName}/folder-1/aws.png" },
                                    new S3Object { Key = $"{directoryName}/folder-1/dummy.pdf" },
                                ],
                                CommonPrefixes =
                                [
                                    $"{directoryName}/folder-1/folder-1-a/",
                                    $"{directoryName}/folder-1/folder-1-b/",
                                ],
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
                        BucketName = directoryName,
                        Key = key,
                        LastModified = LastModified,
                        ResponseStream =
                            key == $"{directoryName}/folder-1/folder-1-a/ContentTest.txt"
                                ? new MemoryStream(Encoding.UTF8.GetBytes("Test Data"))
                                : new MemoryStream(),
                        ContentLength = key switch
                        {
                            $"{directoryName}/dummy.pdf" => 88929,
                            $"{directoryName}/folder-1/folder-1-a/ContentTest.txt" => 7,
                            _ => 0,
                        },
                    };
                    _getObjectResponses.Add(response);

                    return Task.FromResult(response);
                });
            Service = new S3FileProvider(amazonS3, bucketName, directoryName);
        }

        public S3FileProvider Service { get; }

        protected override void DisposeManagedResources()
        {
            foreach (GetObjectResponse response in _getObjectResponses)
            {
                response.Dispose();
            }
        }
    }
}
