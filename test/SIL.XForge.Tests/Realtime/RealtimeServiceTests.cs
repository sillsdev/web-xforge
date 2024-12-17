using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Hangfire;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

[TestFixture]
public class RealtimeServiceTests
{
    [Test]
    public void DeleteProjectAsync_BadArguments()
    {
        var env = new TestEnvironment();
        Assert.ThrowsAsync<ArgumentException>(() => env.Service.DeleteProjectAsync(null));
        Assert.ThrowsAsync<ArgumentException>(() => env.Service.DeleteProjectAsync(""));
    }

    [Test]
    public async Task DeleteProjectAsync_RequestsDocRemovalsInCollections()
    {
        var env = new TestEnvironment();
        const string projectId = "project1id";

        // Set of collections that should be filtered thru to remove matching docs. This set could be different
        // per application (like Scripture Forge, Language Forge, etc.), and the set used here should match what
        // is defined in TestEnvironment.
        var collectionsToBePruned = new Dictionary<string, IMongoCollection<BsonDocument>>();
        string[] collectionNames =
        {
            "some_projects",
            "favorite_numbers",
            "favorite_things",
            "favorite_verses",
            "o_some_projects",
            "o_favorite_numbers",
            "o_favorite_things",
            "o_favorite_verses",
            "m_some_projects",
            "m_favorite_numbers",
            "m_favorite_things",
            "m_favorite_verses",
        };
        foreach (string collectionName in collectionNames)
        {
            IMongoCollection<BsonDocument> collection = Substitute.For<IMongoCollection<BsonDocument>>();
            collectionsToBePruned.Add(collectionName, collection);
            env.MongoDatabase.GetCollection<BsonDocument>(collectionName).Returns(collection);
        }
        // SUT
        await env.Service.DeleteProjectAsync(projectId);
        foreach (IMongoCollection<BsonDocument> collectionToPrune in collectionsToBePruned.Values)
        {
            // A further enhancement would be checking that the filter._value is the desired regex.
            await collectionToPrune.Received(1).DeleteManyAsync(Arg.Any<FilterDefinition<BsonDocument>>());
        }
        env.MongoDatabase.Received(collectionNames.Length).GetCollection<BsonDocument>(Arg.Any<string>());
    }

    [Test]
    public void DeleteUserAsync_BadArguments()
    {
        var env = new TestEnvironment();
        Assert.ThrowsAsync<ArgumentException>(() => env.Service.DeleteUserAsync(null));
        Assert.ThrowsAsync<ArgumentException>(() => env.Service.DeleteUserAsync(""));
    }

    [Test]
    public async Task DeleteUserAsync_RequestsDocRemovalsInCollections()
    {
        var env = new TestEnvironment();
        const string projectId = "project1id";

        // Set of collections that should be filtered thru to remove matching docs.
        // This set could be different
        // per application (like Scripture Forge, Language Forge, etc.), and the set used here should match what
        // is defined in TestEnvironment.
        var collectionsToBePruned = new Dictionary<string, IMongoCollection<BsonDocument>>();
        string[] collectionNames =
        {
            "users",
            "o_users",
            "m_users",
            "favorite_animals",
            "o_favorite_animals",
            "m_favorite_animals",
        };
        foreach (string collectionName in collectionNames)
        {
            IMongoCollection<BsonDocument> collection = Substitute.For<IMongoCollection<BsonDocument>>();
            collectionsToBePruned.Add(collectionName, collection);
            env.MongoDatabase.GetCollection<BsonDocument>(collectionName).Returns(collection);
        }
        // SUT
        await env.Service.DeleteUserAsync(projectId);
        foreach (IMongoCollection<BsonDocument> collectionToPrune in collectionsToBePruned.Values)
        {
            // A further enhancement would be checking that the filter._value is the desired regex.
            await collectionToPrune.Received(1).DeleteManyAsync(Arg.Any<FilterDefinition<BsonDocument>>());
        }
        env.MongoDatabase.Received(collectionNames.Length).GetCollection<BsonDocument>(Arg.Any<string>());
    }

    [Test]
    public async Task GetLastModifiedUserIdAsync_NoMetadata()
    {
        // Setup environment
        var env = new TestEnvironment();
        string id = "123456";
        int version = -1;
        var doc = BsonDocument.Parse("{}");

        // Setup MongoDB mock
        var cursorMock = Substitute.For<IAsyncCursor<BsonDocument>>();
        cursorMock.MoveNextAsync().Returns(Task.FromResult(true), Task.FromResult(false));
        cursorMock.Current.Returns(new[] { doc });
        env.MongoDatabase.GetCollection<BsonDocument>("o_users")
            .FindAsync(Arg.Any<FilterDefinition<BsonDocument>>(), Arg.Any<FindOptions<BsonDocument, BsonDocument>>())
            .Returns(Task.FromResult(cursorMock));

        // SUT
        string userId = await env.Service.GetLastModifiedUserIdAsync<User>(id, version);
        Assert.IsNull(userId);
    }

    [Test]
    public async Task GetLastModifiedUserIdAsync_NoUserId()
    {
        // Setup environment
        var env = new TestEnvironment();
        string id = "123456";
        int version = -1;
        var doc = BsonDocument.Parse("{ m: {} }");

        // Setup MongoDB mock
        var cursorMock = Substitute.For<IAsyncCursor<BsonDocument>>();
        cursorMock.MoveNextAsync().Returns(Task.FromResult(true), Task.FromResult(false));
        cursorMock.Current.Returns(new[] { doc });
        env.MongoDatabase.GetCollection<BsonDocument>("o_users")
            .FindAsync(Arg.Any<FilterDefinition<BsonDocument>>(), Arg.Any<FindOptions<BsonDocument, BsonDocument>>())
            .Returns(Task.FromResult(cursorMock));

        // SUT
        string userId = await env.Service.GetLastModifiedUserIdAsync<User>(id, version);
        Assert.IsNull(userId);
    }

    [Test]
    public async Task GetLastModifiedUserIdAsync_UserIdPresent()
    {
        // Setup environment
        var env = new TestEnvironment();
        string id = "123456";
        int version = -1;
        var doc = BsonDocument.Parse("{ m: { uId: 'abcdef' } }");

        // Setup MongoDB mock
        var cursorMock = Substitute.For<IAsyncCursor<BsonDocument>>();
        cursorMock.MoveNextAsync().Returns(Task.FromResult(true), Task.FromResult(false));
        cursorMock.Current.Returns(new[] { doc });
        env.MongoDatabase.GetCollection<BsonDocument>("o_users")
            .FindAsync(Arg.Any<FilterDefinition<BsonDocument>>(), Arg.Any<FindOptions<BsonDocument, BsonDocument>>())
            .Returns(Task.FromResult(cursorMock));

        // SUT
        string userId = await env.Service.GetLastModifiedUserIdAsync<User>(id, version);
        Assert.AreEqual("abcdef", userId);
    }

    [Test]
    public async Task GetLastModifiedUserIdAsync_ChecksMostRecentVersion()
    {
        // Setup environment
        var env = new TestEnvironment();
        string id = "123456";
        int version = 3;
        var doc1 = BsonDocument.Parse("{ v: 1, m: { uId: 'abcdef' } }");
        var doc2 = BsonDocument.Parse("{ v: 2, m: { uId: 'ghijkl' } }");

        // Setup MongoDB mock
        var cursorMock = Substitute.For<IAsyncCursor<BsonDocument>>();
        cursorMock.MoveNextAsync().Returns(Task.FromResult(true), Task.FromResult(false));
        cursorMock.Current.Returns(new[] { doc2, doc1 });
        env.MongoDatabase.GetCollection<BsonDocument>("o_users")
            .FindAsync(Arg.Any<FilterDefinition<BsonDocument>>(), Arg.Any<FindOptions<BsonDocument, BsonDocument>>())
            .Returns(Task.FromResult(cursorMock));

        // SUT
        string userId = await env.Service.GetLastModifiedUserIdAsync<User>(id, version);
        Assert.AreEqual("ghijkl", userId);
    }

    [Test]
    public void RestartServer_Success()
    {
        var env = new TestEnvironment();
        env.Service.Server.IsServerRunning().Returns(false);
        env.Service.Server.Restart(Arg.Any<object>()).Returns(true);

        // SUT
        env.Service.CheckIfRunning();
        env.Service.Server.Received(1).Restart(Arg.Any<object>());
        env.ExceptionHandler.Received(1)
            .ReportException(Arg.Is<Exception>(e => e.Message == "Successfully restarted the Realtime Server"));
    }

    [Test]
    public void RestartServer_Failed()
    {
        var env = new TestEnvironment();
        env.Service.Server.IsServerRunning().Returns(false);
        env.Service.Server.Restart(Arg.Any<object>()).Returns(false);
        int[] expectedRestartDelayMinutes = [5, 10, 15, 20, 25, 30, 30];

        foreach (int restartDelay in expectedRestartDelayMinutes)
        {
            // SUT
            env.Service.CheckIfRunning();
            env.Service.Server.Received().Restart(Arg.Any<object>());
            env.ExceptionHandler.Received()
                .ReportException(
                    Arg.Is<Exception>(e =>
                        e.Message == $"Failed to restart the Realtime Server - retrying in {restartDelay} minutes"
                    )
                );
        }
    }

    [Test]
    public void RestartServer_ResetDelayAfterFailed()
    {
        var env = new TestEnvironment();
        env.Service.Server.IsServerRunning().Returns(false);
        env.Service.Server.Restart(Arg.Any<object>()).Returns(false);
        int[] expectedRestartDelayMinutes = [5, 10];

        // Fail the restart a few times to increase the delay
        foreach (int restartDelay in expectedRestartDelayMinutes)
        {
            env.Service.CheckIfRunning();
            env.Service.Server.Received().Restart(Arg.Any<object>());
            env.ExceptionHandler.Received()
                .ReportException(
                    Arg.Is<Exception>(e =>
                        e.Message == $"Failed to restart the Realtime Server - retrying in {restartDelay} minutes"
                    )
                );
        }

        // Succeed a restart to restart the delay
        env.Service.Server.Restart(Arg.Any<object>()).Returns(true);
        env.Service.CheckIfRunning();
        env.ExceptionHandler.Received(1)
            .ReportException(Arg.Is<Exception>(e => e.Message == "Successfully restarted the Realtime Server"));

        // Fail the restart again - restart delay should be back to 5 minutes
        env.Service.Server.Restart(Arg.Any<object>()).Returns(false);

        // SUT
        env.Service.CheckIfRunning();
        env.ExceptionHandler.Received(2)
            .ReportException(
                Arg.Is<Exception>(e => e.Message == "Failed to restart the Realtime Server - retrying in 5 minutes")
            );
    }

    [Test]
    public void RestartServer_ShouldNotAttempt()
    {
        // Setup environment
        var env = new TestEnvironment();
        env.Service.Server.IsServerRunning().Returns(true);

        // SUT
        env.Service.CheckIfRunning();
        env.Service.Server.DidNotReceiveWithAnyArgs().Restart(Arg.Any<object>());
    }

    private class TestEnvironment
    {
        public readonly IExceptionHandler ExceptionHandler;
        public readonly RealtimeService Service;
        public readonly IMongoDatabase MongoDatabase = Substitute.For<IMongoDatabase>();

        public TestEnvironment()
        {
            IRealtimeServer realtimeServer = Substitute.For<IRealtimeServer>();
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            IOptions<SiteOptions> siteOptions = Microsoft.Extensions.Options.Options.Create(
                new SiteOptions { Id = "sf" }
            );
            IOptions<DataAccessOptions> dataAccessOptions = Microsoft.Extensions.Options.Options.Create(
                new DataAccessOptions { MongoDatabaseName = "mongoDatabaseName" }
            );
            IOptions<RealtimeOptions> realtimeOptions = Microsoft.Extensions.Options.Options.Create(
                new RealtimeOptions
                {
                    ProjectDoc = new DocConfig("some_projects", typeof(Project)),
                    ProjectDataDocs = new List<DocConfig>
                    {
                        new DocConfig("favorite_numbers", typeof(int)),
                        new DocConfig("favorite_things", typeof(object)),
                        new DocConfig("favorite_verses", typeof(string)),
                    },
                    UserDataDocs = new List<DocConfig> { new DocConfig("favorite_animals", typeof(object)) },
                }
            );
            IOptions<AuthOptions> authOptions = Microsoft.Extensions.Options.Options.Create(
                new AuthOptions
                {
                    Audience = "https://scriptureforge.org/",
                    Domain = "login.scriptureforge.org",
                    Scope = "sf_data",
                }
            );

            IMongoClient mongoClient = Substitute.For<IMongoClient>();
            IRecurringJobManager recurringJobManager = Substitute.For<IRecurringJobManager>();
            mongoClient.GetDatabase(Arg.Any<string>()).Returns(MongoDatabase);
            IConfiguration configuration = Substitute.For<IConfiguration>();

            Service = new RealtimeService(
                realtimeServer,
                ExceptionHandler,
                siteOptions,
                dataAccessOptions,
                realtimeOptions,
                authOptions,
                mongoClient,
                recurringJobManager,
                configuration
            );
        }
    }
}
