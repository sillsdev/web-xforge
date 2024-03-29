using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
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
    public async Task GetRevisionHistoryAsync_Forbidden()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.ParatextService.GetRevisionHistoryAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter)
            .Throws(new ForbiddenException());

        // SUT
        ActionResult<IAsyncEnumerable<KeyValuePair<DateTime, string>>> actual =
            await env.Controller.GetRevisionHistoryAsync(Project01, Book, Chapter);

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetRevisionHistoryAsync_InvalidUser()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.UserAccessor.UserId.Returns("invalid_user");

        // SUT
        ActionResult<IAsyncEnumerable<KeyValuePair<DateTime, string>>> actual =
            await env.Controller.GetRevisionHistoryAsync(Project01, Book, Chapter);

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
        ActionResult<IAsyncEnumerable<KeyValuePair<DateTime, string>>> actual =
            await env.Controller.GetRevisionHistoryAsync(Project01, Book, Chapter);

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetRevisionHistoryAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult<IAsyncEnumerable<KeyValuePair<DateTime, string>>> actual =
            await env.Controller.GetRevisionHistoryAsync(Project01, Book, Chapter);

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        bool historyExists = false;
        var history = (IAsyncEnumerable<KeyValuePair<DateTime, string>>)((OkObjectResult)actual.Result!).Value!;
        await foreach (KeyValuePair<DateTime, string> revision in history)
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
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetSnapshotAsync(
            Project01,
            Book,
            Chapter,
            Timestamp
        );

        Assert.IsInstanceOf<ForbidResult>(actual.Result);
    }

    [Test]
    public async Task GetSnapshotAsync_InvalidUser()
    {
        // Set up test environment
        var env = new TestEnvironment();
        env.UserAccessor.UserId.Returns("invalid_user");

        // SUT
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetSnapshotAsync(
            Project01,
            Book,
            Chapter,
            Timestamp
        );

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
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetSnapshotAsync(
            Project01,
            Book,
            Chapter,
            Timestamp
        );

        Assert.IsInstanceOf<NotFoundResult>(actual.Result);
    }

    [Test]
    public async Task GetSnapshotAsync_Success()
    {
        // Set up test environment
        var env = new TestEnvironment();

        // SUT
        ActionResult<Snapshot<TextData>> actual = await env.Controller.GetSnapshotAsync(
            Project01,
            Book,
            Chapter,
            Timestamp
        );

        Assert.IsInstanceOf<OkObjectResult>(actual.Result);
        var snapshot = (Snapshot<TextData>)((OkObjectResult)actual.Result!).Value!;
        Assert.AreEqual(env.TestSnapshot.Data, snapshot.Data);
        Assert.AreEqual(env.TestSnapshot.Id, snapshot.Id);
        Assert.AreEqual(env.TestSnapshot.Version, snapshot.Version);
    }

    private class TestEnvironment
    {
        public readonly KeyValuePair<DateTime, string> TestRevision = new KeyValuePair<DateTime, string>(
            Timestamp,
            "Test Data"
        );

        public readonly Snapshot<TextData> TestSnapshot = new Snapshot<TextData>
        {
            Data = new TextData(),
            Id = "textId",
            Version = 1,
        };

        public TestEnvironment()
        {
            IExceptionHandler exceptionHandler = Substitute.For<IExceptionHandler>();

            UserAccessor = Substitute.For<IUserAccessor>();
            UserAccessor.UserId.Returns(User01);

            MemoryRepository<UserSecret> userSecrets = new MemoryRepository<UserSecret>(
                new[] { new UserSecret { Id = User01 } }
            );

            ParatextService = Substitute.For<IParatextService>();
            ParatextService
                .GetRevisionHistoryAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter)
                .Returns(RevisionHistory());
            ParatextService
                .GetSnapshotAsync(Arg.Any<UserSecret>(), Project01, Book, Chapter, Timestamp)
                .Returns(Task.FromResult(TestSnapshot));

            Controller = new ParatextController(userSecrets, ParatextService, UserAccessor, exceptionHandler);
        }

        public ParatextController Controller { get; }
        public IParatextService ParatextService { get; }
        public IUserAccessor UserAccessor { get; }

        private async IAsyncEnumerable<KeyValuePair<DateTime, string>> RevisionHistory()
        {
            yield return TestRevision;
            await Task.CompletedTask;
        }
    }
}
