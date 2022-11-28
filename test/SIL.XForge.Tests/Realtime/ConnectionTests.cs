using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using MongoDB.Driver;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime.Json0;
using Options = Microsoft.Extensions.Options.Options;

namespace SIL.XForge.Realtime
{
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
            await env.RealtimeService.Server
                .Received(1)
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
            string collection = "test_project";
            string id = "id1";
            string otTypeName = OTType.Json0;
            var snapshot = new Snapshot<TestProject>
            {
                Data = new TestProject() { Id = id, SyncDisabled = false, },
                Version = 1,
            };
            var builder = new Json0OpBuilder<TestProject>(snapshot.Data);
            builder.Set(p => p.SyncDisabled, true);
            List<Json0Op> op = builder.Op;
            var updatedData = new TestProject() { Id = id, SyncDisabled = true, };

            env.RealtimeService.Server
                .FetchDocAsync<TestProject>(Arg.Any<int>(), collection, id)
                .Returns(Task.FromResult(snapshot));
            env.RealtimeService.Server
                .ApplyOpAsync(otTypeName, snapshot.Data, op)
                .Returns(Task.FromResult(updatedData));

            // Setup Queue
            env.Service.BeginTransaction();
            await env.Service.CreateDocAsync(collection, id, snapshot.Data, otTypeName);
            await env.Service.SubmitOpAsync(collection, id, op, snapshot.Data, snapshot.Version);
            await env.Service.DeleteDocAsync(collection, id);

            // Verify Queue
            Assert.AreEqual(env.Service.QueuedOperations.First().Action, QueuedAction.Create);
            Assert.AreEqual(env.Service.QueuedOperations.Skip(1).First().Action, QueuedAction.Submit);
            Assert.AreEqual(env.Service.QueuedOperations.Last().Action, QueuedAction.Delete);

            // SUT
            await env.Service.CommitTransactionAsync();

            // Verify Submit Operations
            await env.RealtimeService.Server
                .Received(1)
                .CreateDocAsync(
                    Arg.Any<int>(),
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<object>(),
                    Arg.Any<string>()
                );
            await env.RealtimeService.Server
                .Received(1)
                .DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
            await env.RealtimeService.Server
                .Received(1)
                .SubmitOpAsync<object>(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>());
        }

        [Test]
        public async Task CreateDocAsync_QueuesAction()
        {
            // Setup
            var env = new TestEnvironment();
            string collection = "test_project";
            string id = "id1";
            var data = new TestProject { Id = id, Name = "Test Project 1", };
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
            await env.RealtimeService.Server
                .Received(0)
                .CreateDocAsync(
                    Arg.Any<int>(),
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<object>(),
                    Arg.Any<string>()
                );
        }

        [Test]
        public async Task CreateDocAsync_UsesUnderlyingRealtimeServerOutsideOfATransaction()
        {
            // Setup
            var env = new TestEnvironment();
            string collection = "test_project";
            string id = "id1";
            var data = new TestProject { Id = id, Name = "Test Project 1", };
            string otTypeName = OTType.Json0;

            // SUT
            await env.Service.CreateDocAsync(collection, id, data, otTypeName);

            // Verify queue is empty
            Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

            // Verify that the call was not passed to the underlying realtime server
            await env.RealtimeService.Server
                .Received(1)
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
            await env.RealtimeService.Server
                .Received(0)
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

            // Verify that the call was not passed to the underlying realtime server
            await env.RealtimeService.Server
                .Received(1)
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
            await env.RealtimeService.Server
                .Received(0)
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
            var expected = new Snapshot<TestProject> { Data = snapshot.Data, Version = 3, };
            var builder = new Json0OpBuilder<TestProject>(data);
            builder.Set(p => p.SyncDisabled, true);
            List<Json0Op> op = builder.Op;
            env.RealtimeService.Server
                .ApplyOpAsync(Arg.Any<string>(), Arg.Any<TestProject>(), Arg.Any<object>())
                .Returns(Task.FromResult(snapshot.Data));

            // SUT
            env.Service.BeginTransaction();
            env.Service.ExcludePropertyFromTransaction<TestProject>(p => p.SyncDisabled);
            var result = await env.Service.SubmitOpAsync(collection, id, op, snapshot.Data, snapshot.Version);

            Assert.AreEqual(expected.Version, result.Version);
            Assert.AreEqual(expected.Data, result.Data);

            // Verify queue
            Assert.Zero(env.Service.QueuedOperations.Count);

            // Verify that the call was passed to the underlying realtime server
            await env.RealtimeService.Server
                .Received(1)
                .SubmitOpAsync<TestProject>(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>());
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
                Data = new TestProject() { Id = id, SyncDisabled = false, },
                Version = 1,
            };
            var builder = new Json0OpBuilder<TestProject>(snapshot.Data);
            builder.Set(p => p.SyncDisabled, true);
            List<Json0Op> op = builder.Op;
            var updatedData = new TestProject() { Id = id, SyncDisabled = true, };

            env.RealtimeService.Server
                .FetchDocAsync<TestProject>(Arg.Any<int>(), collection, id)
                .Returns(Task.FromResult(snapshot));
            env.RealtimeService.Server
                .ApplyOpAsync(otTypeName, snapshot.Data, op)
                .Returns(Task.FromResult(updatedData));

            // SUT
            env.Service.BeginTransaction();
            var result = await env.Service.SubmitOpAsync(collection, id, op, snapshot.Data, snapshot.Version);

            // Verify result
            Assert.AreEqual(result.Version, 2);
            Assert.AreEqual(result.Data, updatedData);

            // Verify queue
            Assert.AreEqual(env.Service.QueuedOperations.Count, 1);
            QueuedOperation queuedOperation = env.Service.QueuedOperations.First();
            Assert.AreEqual(queuedOperation.Action, QueuedAction.Submit);
            Assert.AreEqual(queuedOperation.Collection, collection);
            Assert.AreEqual(queuedOperation.Op, op);

            // Verify that the call was not passed to the underlying realtime server
            await env.RealtimeService.Server
                .Received(0)
                .SubmitOpAsync<TestProject>(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>());
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
                Data = new TestProject() { Id = id, SyncDisabled = false, },
                Version = 1,
            };
            var builder = new Json0OpBuilder<TestProject>(snapshot.Data);
            builder.Set(p => p.SyncDisabled, true);
            List<Json0Op> op = builder.Op;

            // SUT
            var result = await env.Service.SubmitOpAsync(collection, id, op, snapshot.Data, snapshot.Version);

            // Verify queue
            Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

            // Verify that the call was not passed to the underlying realtime server
            await env.RealtimeService.Server
                .Received(1)
                .SubmitOpAsync<TestProject>(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>());
        }

        private class TestEnvironment
        {
            public Connection Service = null;
            public RealtimeService RealtimeService = null;

            public TestEnvironment()
            {
                var realtimeServer = Substitute.For<IRealtimeServer>();
                var siteOptions = Options.Create(Substitute.For<SiteOptions>());
                var dataAccessOptions = Options.Create(Substitute.For<DataAccessOptions>());
                var realtimeOptions = Options.Create(
                    new RealtimeOptions()
                    {
                        ProjectDoc = new DocConfig("some_projects", typeof(Project)),
                        ProjectDataDocs = new List<DocConfig>(),
                        UserDataDocs = new List<DocConfig>(),
                    }
                );
                var authOptions = Options.Create(Substitute.For<AuthOptions>());
                var mongoClient = Substitute.For<IMongoClient>();
                var configuration = Substitute.For<IConfiguration>();
                RealtimeService = new RealtimeService(
                    realtimeServer,
                    siteOptions,
                    dataAccessOptions,
                    realtimeOptions,
                    authOptions,
                    mongoClient,
                    configuration
                );
                Service = new Connection(RealtimeService);
            }
        }
    }
}
