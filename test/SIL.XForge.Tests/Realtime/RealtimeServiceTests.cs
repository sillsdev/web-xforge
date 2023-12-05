using System;
using System.Collections.Generic;
using System.Threading.Tasks;
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
        env.MongoDatabase
            .GetCollection<BsonDocument>("o_users")
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
        env.MongoDatabase
            .GetCollection<BsonDocument>("o_users")
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
        env.MongoDatabase
            .GetCollection<BsonDocument>("o_users")
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
        env.MongoDatabase
            .GetCollection<BsonDocument>("o_users")
            .FindAsync(Arg.Any<FilterDefinition<BsonDocument>>(), Arg.Any<FindOptions<BsonDocument, BsonDocument>>())
            .Returns(Task.FromResult(cursorMock));

        // SUT
        string userId = await env.Service.GetLastModifiedUserIdAsync<User>(id, version);
        Assert.AreEqual("ghijkl", userId);
    }

    private class TestEnvironment
    {
        public readonly RealtimeService Service;
        public readonly IMongoDatabase MongoDatabase = Substitute.For<IMongoDatabase>();

        public TestEnvironment()
        {
            IRealtimeServer realtimeServer = Substitute.For<IRealtimeServer>();
            IOptions<SiteOptions> siteOptions = Substitute.For<IOptions<SiteOptions>>();
            IOptions<DataAccessOptions> dataAccessOptions = Microsoft
                .Extensions
                .Options
                .Options
                .Create(new DataAccessOptions { MongoDatabaseName = "mongoDatabaseName" });
            IOptions<RealtimeOptions> realtimeOptions = Microsoft
                .Extensions
                .Options
                .Options
                .Create(
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
            IOptions<AuthOptions> authOptions = Substitute.For<IOptions<AuthOptions>>();

            IMongoClient mongoClient = Substitute.For<IMongoClient>();
            mongoClient.GetDatabase(Arg.Any<string>()).Returns(MongoDatabase);
            IConfiguration configuration = Substitute.For<IConfiguration>();

            Service = new RealtimeService(
                realtimeServer,
                siteOptions,
                dataAccessOptions,
                realtimeOptions,
                authOptions,
                mongoClient,
                configuration
            );
        }
    }
}
