using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using Paratext.Data;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class ParatextControllerTests
{
    private const string Book = "MAT";
    private const int Chapter = 1;
    private const string Project01 = "project01";
    private const string User01 = "user01";

    private static readonly DateTime Timestamp = DateTime.UtcNow;

    [Test]
    public async Task DownloadProjectAsync_Forbidden()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.UserAccessor.SystemRoles.Returns([SystemRole.User]);

        // SUT
        ActionResult actual = await env.Controller.DownloadProjectAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task DownloadProjectAsync_NotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        const string message = "Not Found";
        env.MachineProjectService.GetProjectZipAsync(Project01, Arg.Any<Stream>(), CancellationToken.None)
            .Throws(new DataNotFoundException(message));

        // SUT
        ActionResult actual = await env.Controller.DownloadProjectAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<NotFoundObjectResult>(actual);
        Assert.AreEqual(message, (actual as NotFoundObjectResult)?.Value);
    }

    [Test]
    public async Task DownloadProjectAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult actual = await env.Controller.DownloadProjectAsync(Project01, CancellationToken.None);

        // Check the file metadata
        Assert.IsInstanceOf<FileStreamResult>(actual);
        var fileStreamResult = (FileStreamResult)actual;
        Assert.AreEqual("application/zip", fileStreamResult.ContentType);
        Assert.AreEqual("P01.zip", fileStreamResult.FileDownloadName);

        // Check the file stream
        Stream stream = fileStreamResult.FileStream;
        stream.Seek(0, SeekOrigin.Begin);
        byte[] bytes = new byte[4];
        Memory<byte> buffer = new Memory<byte>(bytes);
        int length = await stream.ReadAsync(buffer, CancellationToken.None);
        Assert.AreEqual(4, length);
        Assert.AreEqual(env.ZipHeader, bytes);
    }

    [Test]
    public async Task DownloadProjectAsync_SystemAdmin()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.UserAccessor.SystemRoles.Returns([SystemRole.SystemAdmin]);

        // SUT
        ActionResult actual = await env.Controller.DownloadProjectAsync(Project01, CancellationToken.None);

        Assert.IsInstanceOf<FileStreamResult>(actual);
    }

    [Test]
    public async Task GetAsync_InvalidUser()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.UserAccessor.UserId.Returns("invalid_user");

        // SUT
        ActionResult<IEnumerable<ParatextProject>> actual = await env.Controller.GetAsync();

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GetAsync_SecurityException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetProjectsAsync(Arg.Any<UserSecret>()).Throws<SecurityException>();

        // SUT
        ActionResult<IEnumerable<ParatextProject>> actual = await env.Controller.GetAsync();

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task GetAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult<IEnumerable<ParatextProject>> actual = await env.Controller.GetAsync();

        var projects = (IEnumerable<ParatextProject>)((OkObjectResult)actual.Result!).Value!;
        Assert.AreEqual(env.TestParatextProjects, projects);
    }

    [Test]
    public async Task GetAsync_UnauthorizedAccessException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetProjectsAsync(Arg.Any<UserSecret>()).Throws<UnauthorizedAccessException>();

        // SUT
        ActionResult<IEnumerable<ParatextProject>> actual = await env.Controller.GetAsync();

        Assert.IsInstanceOf<UnauthorizedResult>(actual.Result);
    }

    [Test]
    public async Task GetAsync_CannotConnectException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetProjectsAsync(Arg.Any<UserSecret>()).Throws<CannotConnectException>();

        // SUT
        ActionResult<IEnumerable<ParatextProject>> actual = await env.Controller.GetAsync();

        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, ((ObjectResult)actual.Result).StatusCode);
    }

    [Test]
    public async Task GetRevisionHistoryAsync_Forbidden()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetRevisionHistoryAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<IAsyncEnumerable<DocumentRevision>> actual = await env.Controller.GetRevisionHistoryAsync(
            Project01,
            Book,
            Chapter
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetRevisionHistoryAsync_InvalidUser()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.UserAccessor.UserId.Returns("invalid_user");

        // SUT
        ActionResult<IAsyncEnumerable<DocumentRevision>> actual = await env.Controller.GetRevisionHistoryAsync(
            Project01,
            Book,
            Chapter
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetRevisionHistoryAsync_NotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetRevisionHistoryAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter)
            .Throws(new DataNotFoundException("Not Found"));

        // SUT
        ActionResult<IAsyncEnumerable<DocumentRevision>> actual = await env.Controller.GetRevisionHistoryAsync(
            Project01,
            Book,
            Chapter
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetRevisionHistoryAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult<IAsyncEnumerable<DocumentRevision>> actual = await env.Controller.GetRevisionHistoryAsync(
            Project01,
            Book,
            Chapter
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        bool historyExists = false;
        var history = (IAsyncEnumerable<DocumentRevision>)((OkObjectResult)actual.Result!).Value!;
        await foreach (DocumentRevision revision in history)
        {
            historyExists = true;
            Assert.AreEqual(env.TestRevision, revision);
        }

        Assert.IsTrue(historyExists);
    }

    [Test]
    public async Task GetSnapshotAsync_Forbidden()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetSnapshotAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter, Timestamp)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<TextSnapshot> actual = await env.Controller.GetSnapshotAsync(Project01, Book, Chapter, Timestamp);

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetSnapshotAsync_InvalidUser()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.UserAccessor.UserId.Returns("invalid_user");

        // SUT
        ActionResult<TextSnapshot> actual = await env.Controller.GetSnapshotAsync(Project01, Book, Chapter, Timestamp);

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetSnapshotAsync_NotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetSnapshotAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter, Timestamp)
            .Throws(new DataNotFoundException("Not Found"));

        // SUT
        ActionResult<TextSnapshot> actual = await env.Controller.GetSnapshotAsync(Project01, Book, Chapter, Timestamp);

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetSnapshotAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult<TextSnapshot> actual = await env.Controller.GetSnapshotAsync(Project01, Book, Chapter, Timestamp);

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        var snapshot = (Snapshot<TextData>)((OkObjectResult)actual.Result!).Value!;
        Assert.AreEqual(env.TestSnapshot.Data, snapshot.Data);
        Assert.AreEqual(env.TestSnapshot.Id, snapshot.Id);
        Assert.AreEqual(env.TestSnapshot.Version, snapshot.Version);
    }

    [Test]
    public async Task ResourcesAsync_DataNotFoundException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetResourcesAsync(User01).Throws(new DataNotFoundException("Not found"));

        // SUT
        ActionResult<Dictionary<string, string[]>> actual = await env.Controller.ResourcesAsync();

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task JoinProjectAsync_NotFound()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ProjectService.AddUserAsync(User01, Project01, projectRole: null)
            .ThrowsAsync(new DataNotFoundException("Not Found"));

        // SUT
        ActionResult actual = await env.Controller.JoinProjectAsync(Project01);

        Assert.IsInstanceOf<NotFoundResult>(actual);
    }

    [Test]
    public async Task JoinProjectAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult actual = await env.Controller.JoinProjectAsync(Project01);

        Assert.IsInstanceOf<OkResult>(actual);
    }

    [Test]
    public async Task JoinProjectAsync_Unauthorized()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ProjectService.AddUserAsync(User01, Project01, projectRole: null)
            .ThrowsAsync(new ForbiddenException("Forbidden"));

        // SUT
        ActionResult actual = await env.Controller.JoinProjectAsync(Project01);

        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task ResourcesAsync_SecurityException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetResourcesAsync(User01).Throws<SecurityException>();

        // SUT
        ActionResult<Dictionary<string, string[]>> actual = await env.Controller.ResourcesAsync();

        Assert.IsInstanceOf<NoContentResult>(actual.Result);
    }

    [Test]
    public async Task ResourcesAsync_CannotConnectException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetResourcesAsync(User01).Throws<CannotConnectException>();

        // SUT
        ActionResult<Dictionary<string, string[]>> actual = await env.Controller.ResourcesAsync();

        Assert.IsInstanceOf<ObjectResult>(actual.Result);
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, ((ObjectResult)actual.Result).StatusCode);
    }

    [Test]
    public async Task ResourcesAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult<Dictionary<string, string[]>> actual = await env.Controller.ResourcesAsync();

        var resources = (Dictionary<string, string[]>)((OkObjectResult)actual.Result!).Value!;
        Assert.AreEqual(env.TestParatextResources[0].ParatextId, resources.Keys.First());
        Assert.AreEqual(env.TestParatextResources[0].ShortName, resources.Values.First().ElementAt(0));
        Assert.AreEqual(env.TestParatextResources[0].Name, resources.Values.First().ElementAt(1));
        Assert.AreEqual(env.TestParatextResources[0].LanguageTag, resources.Values.First().ElementAt(2));
    }

    [Test]
    public async Task ResourcesAsync_UnauthorizedAccessException()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetResourcesAsync(User01).Throws<UnauthorizedAccessException>();

        // SUT
        ActionResult<Dictionary<string, string[]>> actual = await env.Controller.ResourcesAsync();

        Assert.IsInstanceOf<UnauthorizedResult>(actual.Result);
    }

    private class TestEnvironment
    {
        public readonly IReadOnlyList<ParatextProject> TestParatextProjects = [new ParatextProject()];
        public readonly IReadOnlyList<ParatextResource> TestParatextResources =
        [
            new ParatextResource
            {
                Name = "Resource 01",
                ParatextId = "res01",
                ShortName = "res",
                LanguageTag = "en",
            },
        ];
        public readonly DocumentRevision TestRevision = new DocumentRevision
        {
            Timestamp = Timestamp,
            Source = OpSource.History,
        };

        public readonly TextSnapshot TestSnapshot = new TextSnapshot
        {
            Data = new TextData(),
            Id = "textId",
            Version = 1,
            IsValid = true,
        };

        public readonly byte[] ZipHeader = [80, 75, 05, 06];

        public TestEnvironment()
        {
            IExceptionHandler exceptionHandler = Substitute.For<IExceptionHandler>();

            UserAccessor = Substitute.For<IUserAccessor>();
            UserAccessor.UserId.Returns(User01);
            UserAccessor.SystemRoles.Returns([SystemRole.ServalAdmin]);

            MemoryRepository<UserSecret> userSecrets = new MemoryRepository<UserSecret>(
                new[] { new UserSecret { Id = User01 } }
            );

            MachineProjectService = Substitute.For<IMachineProjectService>();
            MachineProjectService
                .GetProjectZipAsync(Project01, Arg.Any<Stream>(), CancellationToken.None)
                .Returns(async args =>
                {
                    // Write the zip header, and return the file name
                    Stream stream = args.ArgAt<Stream>(1);
                    var buffer = new ReadOnlyMemory<byte>(ZipHeader);
                    await stream.WriteAsync(buffer, CancellationToken.None);
                    return "P01.zip";
                });

            ParatextService = Substitute.For<IParatextService>();
            ParatextService.GetProjectsAsync(Arg.Any<UserSecret>()).Returns(Task.FromResult(TestParatextProjects));
            ParatextService.GetResourcesAsync(User01).Returns(Task.FromResult(TestParatextResources));
            ParatextService
                .GetRevisionHistoryAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter)
                .Returns(RevisionHistory());
            ParatextService
                .GetSnapshotAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter, Timestamp)
                .Returns(Task.FromResult(TestSnapshot));

            ProjectService = Substitute.For<ISFProjectService>();

            Controller = new ParatextController(
                exceptionHandler,
                MachineProjectService,
                ParatextService,
                ProjectService,
                UserAccessor,
                userSecrets
            );
        }

        public ParatextController Controller { get; }
        public IMachineProjectService MachineProjectService { get; }
        public IParatextService ParatextService { get; }
        public ISFProjectService ProjectService { get; }
        public IUserAccessor UserAccessor { get; }

        private async IAsyncEnumerable<DocumentRevision> RevisionHistory()
        {
            yield return TestRevision;
            await Task.CompletedTask;
        }
    }
}
