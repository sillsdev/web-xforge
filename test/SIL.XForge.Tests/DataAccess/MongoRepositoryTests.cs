using System;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using MongoDB.Bson;
using MongoDB.Driver;
using MongoDB.Driver.Core.Clusters;
using MongoDB.Driver.Core.Connections;
using MongoDB.Driver.Core.Servers;
using MongoDB.Driver.Linq;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Models;

namespace SIL.XForge.DataAccess;

[TestFixture]
public class MongoRepositoryTests
{
    [Test]
    public async Task CountDocumentsAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.CountDocumentsAsync(e => e.Id == "123");
        await env
            .MongoCollection.Received()
            .CountDocumentsAsync(filter: Arg.Any<FilterDefinition<TestClass>>(), options: null, CancellationToken.None);
    }

    [Test]
    public async Task DeleteAllAsync_Success()
    {
        var env = new TestEnvironment();
        const long expected = 4;
        env.MongoCollection.DeleteManyAsync(filter: Arg.Any<FilterDefinition<TestClass>>(), CancellationToken.None)
            .Returns(Task.FromResult<DeleteResult>(new DeleteResult.Acknowledged(expected)));

        // SUT
        long actual = await env.Service.DeleteAllAsync(e => e.Id == "123");
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public async Task DeleteAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.DeleteAsync(e => e.Id == "123");
        await env
            .MongoCollection.Received()
            .FindOneAndDeleteAsync<TestClass>(
                filter: Arg.Any<ExpressionFilterDefinition<TestClass>>(),
                options: null,
                CancellationToken.None
            );
    }

    [Test]
    public void Init_Success()
    {
        var initCalled = false;
        var env = new TestEnvironment(_ => initCalled = true);

        // SUT
        env.Service.Init();
        Assert.IsTrue(initCalled);
    }

    [Test]
    public void InsertAsync_DuplicateKey()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();
        MongoWriteException ex = TestEnvironment.GetMongoWriteException(duplicateKey: true);
        env.MongoCollection.InsertOneAsync(entity).ThrowsAsync(ex);

        // SUT
        Assert.ThrowsAsync<DuplicateKeyException>(() => env.Service.InsertAsync(entity));
    }

    [Test]
    public void InsertAsync_MongoException()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();
        MongoWriteException ex = TestEnvironment.GetMongoWriteException(duplicateKey: false);
        env.MongoCollection.InsertOneAsync(entity).ThrowsAsync(ex);

        // SUT
        Assert.ThrowsAsync<MongoWriteException>(() => env.Service.InsertAsync(entity));
    }

    [Test]
    public async Task InsertAsync_Success()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();

        // SUT
        await env.Service.InsertAsync(entity);
        await env.MongoCollection.Received().InsertOneAsync(entity);
    }

    [Test]
    public void ReplaceAsync_DuplicateKey()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();
        MongoWriteException ex = TestEnvironment.GetMongoWriteException(duplicateKey: true);
        env.MongoCollection.ReplaceOneAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                entity,
                options: Arg.Is<ReplaceOptions>(o => !o.IsUpsert),
                CancellationToken.None
            )
            .ThrowsAsync(ex);

        // SUT
        Assert.ThrowsAsync<DuplicateKeyException>(() => env.Service.ReplaceAsync(entity));
    }

    [Test]
    public void ReplaceAsync_MongoException()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();
        MongoWriteException ex = TestEnvironment.GetMongoWriteException(duplicateKey: false);
        env.MongoCollection.ReplaceOneAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                entity,
                options: Arg.Is<ReplaceOptions>(o => !o.IsUpsert),
                CancellationToken.None
            )
            .ThrowsAsync(ex);

        // SUT
        Assert.ThrowsAsync<MongoWriteException>(() => env.Service.ReplaceAsync(entity));
    }

    [Test]
    public async Task ReplaceAsync_NoneMatched()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();
        var result = new ReplaceOneResult.Acknowledged(0, 0, BsonValue.Create(entity.Id));
        env.MongoCollection.ReplaceOneAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                entity,
                options: Arg.Is<ReplaceOptions>(o => !o.IsUpsert),
                CancellationToken.None
            )
            .Returns(result);

        // SUT
        bool actual = await env.Service.ReplaceAsync(entity);
        Assert.IsFalse(actual);
    }

    [Test]
    public async Task ReplaceAsync_Success()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();
        var result = new ReplaceOneResult.Acknowledged(1, 1, BsonValue.Create(entity.Id));
        env.MongoCollection.ReplaceOneAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                entity,
                options: Arg.Is<ReplaceOptions>(o => !o.IsUpsert),
                CancellationToken.None
            )
            .Returns(result);

        // SUT
        bool actual = await env.Service.ReplaceAsync(entity);
        Assert.IsTrue(actual);
    }

    [Test]
    public async Task ReplaceAsync_Unacknowledged()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();
        var result = ReplaceOneResult.Unacknowledged.Instance;
        env.MongoCollection.ReplaceOneAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                entity,
                options: Arg.Is<ReplaceOptions>(o => !o.IsUpsert),
                CancellationToken.None
            )
            .Returns(result);

        // SUT
        bool actual = await env.Service.ReplaceAsync(entity);
        Assert.IsFalse(actual);
    }

    [Test]
    public async Task ReplaceAsync_Upsert()
    {
        var env = new TestEnvironment();
        var entity = new TestClass();
        var result = new ReplaceOneResult.Acknowledged(0, 0, BsonValue.Create(entity.Id));
        env.MongoCollection.ReplaceOneAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                entity,
                options: Arg.Is<ReplaceOptions>(o => o.IsUpsert),
                CancellationToken.None
            )
            .Returns(result);

        // SUT
        bool actual = await env.Service.ReplaceAsync(entity, upsert: true);
        Assert.IsTrue(actual);
    }

    [Test]
    public void UpdateAsync_DuplicateKey()
    {
        var env = new TestEnvironment();
        MongoWriteException ex = TestEnvironment.GetMongoWriteException(duplicateKey: true);
        env.MongoCollection.FindOneAndUpdateAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                update: Arg.Any<UpdateDefinition<TestClass>>(),
                options: Arg.Any<FindOneAndUpdateOptions<TestClass>>(),
                CancellationToken.None
            )
            .ThrowsAsync(ex);

        // SUT
        Assert.ThrowsAsync<DuplicateKeyException>(() =>
            env.Service.UpdateAsync(e => e.Id == "123", u => u.Set(e => e.Id, "124"), upsert: false)
        );
    }

    [Test]
    public void UpdateAsync_MongoException()
    {
        var env = new TestEnvironment();
        MongoWriteException ex = TestEnvironment.GetMongoWriteException(duplicateKey: false);
        env.MongoCollection.FindOneAndUpdateAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                update: Arg.Any<UpdateDefinition<TestClass>>(),
                options: Arg.Any<FindOneAndUpdateOptions<TestClass>>(),
                CancellationToken.None
            )
            .ThrowsAsync(ex);

        // SUT
        Assert.ThrowsAsync<MongoWriteException>(() =>
            env.Service.UpdateAsync(e => e.Id == "123", u => u.Set(e => e.Id, "124"), upsert: false)
        );
    }

    [TestCase(true)]
    [TestCase(false)]
    public async Task UpdateAsync_Success(bool upsert)
    {
        var env = new TestEnvironment();
        var expected = new TestClass();
        env.MongoCollection.FindOneAndUpdateAsync(
                filter: Arg.Any<FilterDefinition<TestClass>>(),
                update: Arg.Any<UpdateDefinition<TestClass>>(),
                options: Arg.Is<FindOneAndUpdateOptions<TestClass>>(o => o.IsUpsert == upsert),
                CancellationToken.None
            )
            .Returns(Task.FromResult(expected));

        // SUT
        TestClass actual = await env.Service.UpdateAsync(e => e.Id == "123", u => u.Set(e => e.Id, "124"), upsert);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void Query_Success()
    {
        var env = new TestEnvironment();

        // SUT
        IQueryable<TestClass> actual = env.Service.Query();
        Assert.IsNotNull(actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment(Action<IMongoCollection<TestClass>>? action = null)
        {
            action ??= _ => { };

            // Mock the MongoDB client and database
            var mockClient = Substitute.For<IMongoClient>();
            var mockDatabase = Substitute.For<IMongoDatabase>();
            var mockSettings = new MongoClientSettings { LinqProvider = LinqProvider.V3 };
            mockClient.Settings.Returns(mockSettings);
            mockDatabase.Client.Returns(mockClient);
            MongoCollection.Database.Returns(mockDatabase);

            Service = new MongoRepository<TestClass>(MongoCollection, action);
        }

        public IMongoCollection<TestClass> MongoCollection { get; } = Substitute.For<IMongoCollection<TestClass>>();
        public MongoRepository<TestClass> Service { get; }

        public static MongoWriteException GetMongoWriteException(bool duplicateKey)
        {
            // Construct the MongoWriteException via reflection.
            // This may break on MongoDB version updates if the internal constructors change
            var connectionId = new ConnectionId(new ServerId(new ClusterId(1), new DnsEndPoint("localhost", 27017)), 2);
            var ctor = typeof(WriteConcernError).GetConstructors(BindingFlags.Instance | BindingFlags.NonPublic)[0];
            var writeConcernError = (WriteConcernError)
                ctor.Invoke(
                    [1, "codeName", "message", new BsonDocument("details", "writeConcernError"), Array.Empty<string>()]
                );
            ctor = typeof(WriteError).GetConstructors(BindingFlags.Instance | BindingFlags.NonPublic)[0];
            var writeError = (WriteError)
                ctor.Invoke(
                    [
                        duplicateKey ? ServerErrorCategory.DuplicateKey : ServerErrorCategory.Uncategorized,
                        1,
                        "writeError",
                        new BsonDocument("details", "writeError"),
                    ]
                );
            return new MongoWriteException(connectionId, writeError, writeConcernError, new Exception());
        }
    }

    public class TestClass : IIdentifiable
    {
        public string Id { get; set; }
    }
}
