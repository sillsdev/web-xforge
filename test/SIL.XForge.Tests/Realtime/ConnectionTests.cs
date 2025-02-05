using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Hangfire;
using Microsoft.Extensions.Configuration;
using MongoDB.Driver;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime.Json0;
using Options = Microsoft.Extensions.Options.Options;

namespace SIL.XForge.Realtime;

[TestFixture]
public class ConnectionTests
{
    [Test]
    public async Task CommitTransactionAsync_ClearsExcludedProperties()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";

        // Set up excluded operations and queue
        env.Service.BeginTransaction();
        env.Service.ExcludePropertyFromTransaction<TestProject>(op => op.SyncDisabled);
        await env.Service.DeleteDocAsync(collection, id);

        // Verify excluded operations and queue
        Assert.AreEqual(env.Service.ExcludedProperties.Count, 1);
        Assert.AreEqual(env.Service.QueuedOperations.Count, 1);

        // SUT
        await env.Service.CommitTransactionAsync();

        // Verify the clear
        Assert.AreEqual(env.Service.ExcludedProperties.Count, 0);
        Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

        // Verify that the call was passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(1)
            .DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public void CommitTransactionAsync_RequiresBeginTransaction()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ArgumentException>(() => env.Service.CommitTransactionAsync());
    }

    [Test]
    public async Task CommitTransactionAsync_UsesUnderlyingRealtimeServerOnCommit()
    {
        // Setup
        var env = new TestEnvironment();
        const string collection = "test_project";
        const string id = "id1";
        const string otTypeName = OTType.Json0;
        var data = new TestProject { Id = id, SyncDisabled = false };
        var snapshot = new Snapshot<TestProject> { Data = data, Version = 1 };
        var builder = new Json0OpBuilder<TestProject>(snapshot.Data);
        builder.Set(p => p.SyncDisabled, true);
        List<Json0Op> op = builder.Op;
        var updatedData = new TestProject { Id = id, SyncDisabled = true };

        env.RealtimeService.Server.FetchDocAsync<TestProject>(Arg.Any<int>(), collection, id)
            .Returns(Task.FromResult(snapshot));
        env.RealtimeService.Server.ApplyOpAsync(otTypeName, snapshot.Data, op).Returns(Task.FromResult(updatedData));

        // Setup Queue
        env.Service.BeginTransaction();
        await env.Service.CreateDocAsync(collection, id, snapshot.Data, otTypeName);
        await env.Service.SubmitOpAsync(collection, id, op, snapshot.Data, snapshot.Version, source: null);
        await env.Service.ReplaceDocAsync(collection, id, data, snapshot.Version, source: null);
        await env.Service.DeleteDocAsync(collection, id);

        // Verify Queue
        Assert.AreEqual(QueuedAction.Create, env.Service.QueuedOperations.First().Action);
        Assert.AreEqual(QueuedAction.Submit, env.Service.QueuedOperations.Skip(1).First().Action);
        Assert.AreEqual(QueuedAction.Replace, env.Service.QueuedOperations.Skip(2).First().Action);
        Assert.AreEqual(QueuedAction.Delete, env.Service.QueuedOperations.Last().Action);

        // SUT
        await env.Service.CommitTransactionAsync();

        // Verify Submit Operations
        await env
            .RealtimeService.Server.Received(1)
            .CreateDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>(), Arg.Any<string>());
        await env
            .RealtimeService.Server.Received(1)
            .DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
        await env
            .RealtimeService.Server.Received(1)
            .SubmitOpAsync<object>(
                Arg.Any<int>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<object>(),
                Arg.Any<OpSource?>()
            );
        await env
            .RealtimeService.Server.Received(1)
            .ReplaceDocAsync(
                Arg.Any<int>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<object>(),
                Arg.Any<OpSource?>()
            );
    }

    [Test]
    public async Task CreateDocAsync_QueuesAction()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";
        var data = new TestProject { Id = id, Name = "Test Project 1" };
        string otTypeName = OTType.Json0;

        // SUT
        env.Service.BeginTransaction();
        var result = await env.Service.CreateDocAsync(collection, id, data, otTypeName);

        // Verify result
        Assert.AreEqual(result.Version, 1);
        Assert.AreEqual(result.Data, data);

        // Verify queue
        Assert.AreEqual(env.Service.QueuedOperations.Count, 1);
        QueuedOperation queuedOperation = env.Service.QueuedOperations.First();
        Assert.AreEqual(queuedOperation.Action, QueuedAction.Create);
        Assert.AreEqual(queuedOperation.Collection, collection);
        Assert.AreEqual(queuedOperation.Data, data);
        Assert.AreEqual(queuedOperation.Id, id);
        Assert.AreEqual(queuedOperation.OtTypeName, otTypeName);

        // Verify that the call was not passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(0)
            .CreateDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>(), Arg.Any<string>());
    }

    [Test]
    public async Task CreateDocAsync_UsesUnderlyingRealtimeServerOutsideOfATransaction()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";
        var data = new TestProject { Id = id, Name = "Test Project 1" };
        string otTypeName = OTType.Json0;

        // SUT
        await env.Service.CreateDocAsync(collection, id, data, otTypeName);

        // Verify queue is empty
        Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

        // Verify that the call was passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(1)
            .CreateDocAsync(
                Arg.Any<int>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<TestProject>(),
                Arg.Any<string>()
            );
    }

    [Test]
    public async Task DeleteDocAsync_QueuesAction()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";

        // SUT
        env.Service.BeginTransaction();
        await env.Service.DeleteDocAsync(collection, id);

        // Verify queue
        Assert.AreEqual(env.Service.QueuedOperations.Count, 1);
        QueuedOperation queuedOperation = env.Service.QueuedOperations.First();
        Assert.AreEqual(queuedOperation.Action, QueuedAction.Delete);
        Assert.AreEqual(queuedOperation.Collection, collection);
        Assert.AreEqual(queuedOperation.Id, id);

        // Verify that the call was not passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(0)
            .DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task DeleteDocAsync_UsesUnderlyingRealtimeServerOutsideOfATransaction()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";

        // SUT
        await env.Service.DeleteDocAsync(collection, id);

        // Verify queue is empty
        Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

        // Verify that the call was passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(1)
            .DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public void ExcludePropertyFromTransaction_DeconstructsTheProperty()
    {
        // Setup
        var env = new TestEnvironment();
        env.Service.BeginTransaction();

        // SUT
        env.Service.ExcludePropertyFromTransaction<TestProject>(op => op.SyncDisabled);

        // Verify
        Assert.AreEqual(env.Service.ExcludedProperties.Count, 1);
        Assert.AreEqual(env.Service.ExcludedProperties.First(), "testproject.syncdisabled");
    }

    [Test]
    public void ExcludePropertyFromTransaction_RequiresBeginTransaction()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.Throws<ArgumentException>(
            () => env.Service.ExcludePropertyFromTransaction<TestProject>(op => op.SyncDisabled)
        );
    }

    [Test]
    public async Task FetchDocAsync_UsesUnderlyingRealtimeServer()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";

        // SUT
        await env.Service.FetchDocAsync<TestProject>(collection, id);

        // Verify
        await env.RealtimeService.Server.Received(1).FetchDocAsync<TestProject>(Arg.Any<int>(), collection, id);
    }

    [Test]
    public async Task Get_RetrievesCachedDoc()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = env.RealtimeService.GetDocConfig<Project>().CollectionName;
        const string id = "id1";
        env.RealtimeService.Server.FetchDocAsync<Project>(Arg.Any<int>(), collection, id)
            .Returns(
                new Snapshot<Project>
                {
                    Data = new TestProject(),
                    Id = "id1",
                    Version = 1,
                }
            );

        // SUT
        var doc = env.Service.Get<Project>(id);
        await doc.FetchAsync();
        var result = env.Service.Get<Project>(id);

        // Verify doc is fetched
        Assert.AreEqual("id1", doc.Id);
        Assert.AreEqual(1, doc.Version);
        Assert.IsNotNull(doc.Data);

        // Verify result has the data of the fetched doc
        Assert.AreEqual("id1", result.Id);
        Assert.AreEqual(1, result.Version);
        Assert.IsNotNull(result.Data);
    }

    [Test]
    public async Task Get_DoesNotUseCacheIfCacheDisabled()
    {
        // Setup
        var env = new TestEnvironment(documentCacheDisabled: true);
        string collection = env.RealtimeService.GetDocConfig<Project>().CollectionName;
        const string id = "id1";
        env.RealtimeService.Server.FetchDocAsync<Project>(Arg.Any<int>(), collection, id)
            .Returns(
                new Snapshot<Project>
                {
                    Data = new TestProject(),
                    Id = "id1",
                    Version = 1,
                }
            );

        // SUT
        var doc = env.Service.Get<Project>(id);
        await doc.FetchAsync();
        var result = env.Service.Get<Project>(id);

        // Verify doc is fetched
        Assert.AreEqual("id1", doc.Id);
        Assert.AreEqual(1, doc.Version);
        Assert.IsNotNull(doc.Data);

        // Verify result does not have the data of the fetched doc
        Assert.AreEqual("id1", result.Id);
        Assert.AreEqual(-1, result.Version);
        Assert.Null(result.Data);
    }

    [Test]
    public async Task GetAndFetchDocsAsync_NoIds()
    {
        // Setup
        var env = new TestEnvironment();
        string[] ids = [];

        // SUT
        IReadOnlyCollection<IDocument<Project>> actual = await env.Service.GetAndFetchDocsAsync<Project>(ids);

        // Verify
        Assert.IsEmpty(actual);
    }

    [Test]
    public async Task GetAndFetchDocsAsync_RetrievesDocsWithData()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = env.RealtimeService.GetDocConfig<Project>().CollectionName;
        string[] ids = ["id1", "id2"];
        env.RealtimeService.Server.FetchDocsAsync<Project>(Arg.Any<int>(), collection, ids)
            .Returns(
                [
                    new Snapshot<Project>
                    {
                        Data = null,
                        Id = "id1",
                        Version = 1,
                    },
                    new Snapshot<Project>
                    {
                        Data = new TestProject(),
                        Id = "id2",
                        Version = 2,
                    },
                ]
            );

        // SUT
        var result = await env.Service.GetAndFetchDocsAsync<Project>(ids);

        // Verify
        Assert.AreEqual(1, result.Count);
        Assert.AreEqual("id2", result.First().Id);
        Assert.AreEqual(2, result.First().Version);
        Assert.IsNotNull(result.First().Data);
    }

    [Test]
    public async Task GetAndFetchDocsAsync_RetrievesDocWithCacheDisabled()
    {
        // Setup
        var env = new TestEnvironment(documentCacheDisabled: true);
        string collection = env.RealtimeService.GetDocConfig<Project>().CollectionName;
        string[] ids = ["id1"];
        env.RealtimeService.Server.FetchDocsAsync<Project>(Arg.Any<int>(), collection, ids)
            .Returns(
                [
                    new Snapshot<Project>
                    {
                        Data = new TestProject(),
                        Id = "id1",
                        Version = 1,
                    },
                ]
            );

        // SUT
        var result = await env.Service.GetAndFetchDocsAsync<Project>(ids);

        // Verify
        Assert.AreEqual(1, result.Count);
        Assert.AreEqual("id1", result.First().Id);
        Assert.AreEqual(1, result.First().Version);
        Assert.IsNotNull(result.First().Data);
    }

    [Test]
    public async Task ReplaceDocAsync_QueuesAction()
    {
        // Setup
        var env = new TestEnvironment();
        const string collection = "test_project";
        const string id = "id1";
        var data = new TestProject { Id = id, Name = "Test Project 1" };
        const int currentVersion = 1;
        OpSource? source = OpSource.Draft;

        // SUT
        env.Service.BeginTransaction();
        Snapshot<TestProject> actual = await env.Service.ReplaceDocAsync(collection, id, data, currentVersion, source);

        // Verify result
        Assert.AreEqual(currentVersion + 1, actual.Version);
        Assert.AreEqual(data, actual.Data);

        // Verify queue
        Assert.AreEqual(1, env.Service.QueuedOperations.Count);
        QueuedOperation queuedOperation = env.Service.QueuedOperations.First();
        Assert.AreEqual(QueuedAction.Replace, queuedOperation.Action);
        Assert.AreEqual(collection, queuedOperation.Collection);
        Assert.AreEqual(data, queuedOperation.Data);
        Assert.AreEqual(id, queuedOperation.Id);
        Assert.AreEqual(source, queuedOperation.Source);

        // Verify that the call was not passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(0)
            .ReplaceDocAsync(
                Arg.Any<int>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<object>(),
                Arg.Any<OpSource?>()
            );
    }

    [Test]
    public async Task ReplaceDocAsync_UsesUnderlyingRealtimeServerOutsideOfATransaction()
    {
        // Setup
        var env = new TestEnvironment();
        const string collection = "test_project";
        const string id = "id1";
        var data = new TestProject { Id = id, Name = "Test Project 1" };
        const int currentVersion = 1;
        OpSource? source = OpSource.Draft;

        // SUT
        await env.Service.ReplaceDocAsync(collection, id, data, currentVersion, source);

        // Verify queue is empty
        Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

        // Verify that the call was passed to the underlying realtime server
        await env.RealtimeService.Server.Received(1).ReplaceDocAsync(Arg.Any<int>(), collection, id, data, source);
    }

    [Test]
    public async Task RollbackTransaction_ClearsQueuedOperationsAndExcludedProperties()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";

        // Set up excluded operations and queue
        env.Service.BeginTransaction();
        env.Service.ExcludePropertyFromTransaction<TestProject>(op => op.SyncDisabled);
        await env.Service.DeleteDocAsync(collection, id);

        // Verify excluded operations and queue
        Assert.AreEqual(env.Service.ExcludedProperties.Count, 1);
        Assert.AreEqual(env.Service.QueuedOperations.Count, 1);

        // SUT
        env.Service.RollbackTransaction();

        // Verify the clear
        Assert.AreEqual(env.Service.ExcludedProperties.Count, 0);
        Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

        // Verify that the call was not passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(0)
            .DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public void RollbackTransaction_RequiresBeginTransaction()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.Throws<ArgumentException>(() => env.Service.RollbackTransaction());
    }

    [Test]
    public async Task SubmitOpAsync_ExecutesExcludedAction()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";
        var data = new TestProject { Id = id, SyncDisabled = false };
        var snapshot = new Snapshot<TestProject>
        {
            Data = new TestProject { Id = id, SyncDisabled = true },
            Version = 2,
        };
        var expected = new Snapshot<TestProject> { Data = snapshot.Data, Version = 3 };
        var builder = new Json0OpBuilder<TestProject>(data);
        builder.Set(p => p.SyncDisabled, true);
        List<Json0Op> op = builder.Op;
        env.RealtimeService.Server.ApplyOpAsync(Arg.Any<string>(), Arg.Any<TestProject>(), Arg.Any<object>())
            .Returns(Task.FromResult(snapshot.Data));

        // SUT
        env.Service.BeginTransaction();
        env.Service.ExcludePropertyFromTransaction<TestProject>(p => p.SyncDisabled);
        var result = await env.Service.SubmitOpAsync(collection, id, op, snapshot.Data, snapshot.Version, null);

        Assert.AreEqual(expected.Version, result.Version);
        Assert.AreEqual(expected.Data, result.Data);

        // Verify queue
        Assert.Zero(env.Service.QueuedOperations.Count);

        // Verify that the call was passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(1)
            .SubmitOpAsync<TestProject>(
                Arg.Any<int>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<object>(),
                Arg.Any<OpSource?>()
            );
    }

    [Test]
    public async Task SubmitOpAsync_QueuesAction()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";
        string otTypeName = OTType.Json0;
        var snapshot = new Snapshot<TestProject>
        {
            Data = new TestProject() { Id = id, SyncDisabled = false },
            Version = 1,
        };
        var builder = new Json0OpBuilder<TestProject>(snapshot.Data);
        builder.Set(p => p.SyncDisabled, true);
        List<Json0Op> op = builder.Op;
        var updatedData = new TestProject() { Id = id, SyncDisabled = true };

        env.RealtimeService.Server.FetchDocAsync<TestProject>(Arg.Any<int>(), collection, id)
            .Returns(Task.FromResult(snapshot));
        env.RealtimeService.Server.ApplyOpAsync(otTypeName, snapshot.Data, op).Returns(Task.FromResult(updatedData));

        // SUT
        env.Service.BeginTransaction();
        var result = await env.Service.SubmitOpAsync(
            collection,
            id,
            op,
            snapshot.Data,
            snapshot.Version,
            OpSource.Editor
        );

        // Verify result
        Assert.AreEqual(result.Version, 2);
        Assert.AreEqual(result.Data, updatedData);

        // Verify queue
        Assert.AreEqual(env.Service.QueuedOperations.Count, 1);
        QueuedOperation queuedOperation = env.Service.QueuedOperations.First();
        Assert.AreEqual(queuedOperation.Action, QueuedAction.Submit);
        Assert.AreEqual(queuedOperation.Collection, collection);
        Assert.AreEqual(queuedOperation.Op, op);
        Assert.AreEqual(queuedOperation.Source, OpSource.Editor);

        // Verify that the call was not passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(0)
            .SubmitOpAsync<TestProject>(
                Arg.Any<int>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<object>(),
                Arg.Any<OpSource?>()
            );
    }

    [Test]
    public async Task SubmitOpAsync_UsesUnderlyingRealtimeServerOutsideOfATransaction()
    {
        // Setup
        var env = new TestEnvironment();
        string collection = "test_project";
        string id = "id1";
        var snapshot = new Snapshot<TestProject>
        {
            Data = new TestProject() { Id = id, SyncDisabled = false },
            Version = 1,
        };
        var builder = new Json0OpBuilder<TestProject>(snapshot.Data);
        builder.Set(p => p.SyncDisabled, true);
        List<Json0Op> op = builder.Op;

        // SUT
        await env.Service.SubmitOpAsync(collection, id, op, snapshot.Data, snapshot.Version, null);

        // Verify queue
        Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

        // Verify that the call was passed to the underlying realtime server
        await env
            .RealtimeService.Server.Received(1)
            .SubmitOpAsync<TestProject>(
                Arg.Any<int>(),
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<object>(),
                Arg.Any<OpSource?>()
            );
    }

    [Test]
    public async Task FetchSnapshotAsync_Success()
    {
        var env = new TestEnvironment();
        string collection = env.RealtimeService.GetDocConfig<Project>().CollectionName;
        const string id = "project01";
        var snapshot = new Snapshot<Project>
        {
            Data = new TestProject(),
            Id = id,
            Version = 1,
        };
        DateTime timestamp = DateTime.UtcNow;
        env.RealtimeService.Server.FetchSnapshotAsync<Project>(Arg.Any<int>(), collection, id, timestamp)
            .Returns(Task.FromResult(snapshot));

        // SUT
        Snapshot<Project> actual = await env.Service.FetchSnapshotAsync<Project>(id, timestamp);
        Assert.AreEqual(snapshot.Data, actual.Data);
        Assert.AreEqual(snapshot.Id, actual.Id);
        Assert.AreEqual(snapshot.Version, actual.Version);
    }

    [Test]
    public async Task GetOps_Success()
    {
        var env = new TestEnvironment();
        string collection = env.RealtimeService.GetDocConfig<Project>().CollectionName;
        const string id = "project01";
        var ops = new Op[]
        {
            new Op
            {
                Metadata = new OpMetadata { Timestamp = DateTime.UtcNow },
                Version = 1,
            },
        };
        env.RealtimeService.Server.GetOpsAsync(collection, id).Returns(Task.FromResult(ops));

        // SUT
        Op[] actual = await env.Service.GetOpsAsync<Project>(id);
        Assert.AreEqual(ops.Length, 1);
        Assert.AreEqual(ops[0].Metadata.Timestamp, actual[0].Metadata.Timestamp);
        Assert.AreEqual(ops[0].Version, actual[0].Version);
    }

    private class TestEnvironment
    {
        public readonly Connection Service;
        public readonly RealtimeService RealtimeService;

        public TestEnvironment(bool documentCacheDisabled = false)
        {
            var realtimeServer = Substitute.For<IRealtimeServer>();
            IExceptionHandler exceptionHandler = Substitute.For<IExceptionHandler>();
            var siteOptions = Options.Create(Substitute.For<SiteOptions>());
            var dataAccessOptions = Options.Create(Substitute.For<DataAccessOptions>());
            var realtimeOptions = Options.Create(
                new RealtimeOptions()
                {
                    ProjectDoc = new DocConfig("some_projects", typeof(Project)),
                    ProjectDataDocs = [],
                    UserDataDocs = [],
                }
            );
            var authOptions = Options.Create(Substitute.For<AuthOptions>());
            var mongoClient = Substitute.For<IMongoClient>();
            IRecurringJobManager recurringJobManager = Substitute.For<IRecurringJobManager>();
            var configuration = Substitute.For<IConfiguration>();
            RealtimeService = new RealtimeService(
                realtimeServer,
                exceptionHandler,
                siteOptions,
                dataAccessOptions,
                realtimeOptions,
                authOptions,
                mongoClient,
                recurringJobManager,
                configuration
            );
            Service = new Connection(RealtimeService, documentCacheDisabled);
        }
    }
}
