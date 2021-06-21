using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Models;
using SIL.XForge.Realtime.Json0;

namespace SIL.XForge.Realtime
{
    [TestFixture]
    class QueuedRealtimeServerTests
    {
        [Test]
        public async Task ApplyOpAsync_UsesUnderlyingRealtimeServer()
        {
            // Setup
            var env = new TestEnvironment();
            var data = new TestProject();
            var builder = new Json0OpBuilder<TestProject>(data);
            builder.Set(p => p.SyncDisabled, true);

            // SUT
            await env.Service.ApplyOpAsync(OTType.Json0, data, builder.Op);

            // Verify
            await env.RealtimeServer.Received(1).ApplyOpAsync(OTType.Json0, data, builder.Op);
        }

        [Test]
        public async Task ClearOperationsAsync_ClearsQueuedOperationsAndExcludedProperties()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;
            string collection = "test_project";
            string id = "id1";

            // Set up excluded operations and queue
            env.Service.ExcludePropertyFromTransaction<TestProject>(op => op.SyncDisabled);
            await env.Service.DeleteDocAsync(handle, collection, id);

            // Verify excluded operations and queue
            Assert.AreEqual(env.Service.ExcludedProperties.Count, 1);
            Assert.AreEqual(env.Service.QueuedOperations.Count, 1);

            // SUT
            await env.Service.ClearOperationsAsync();

            // Verify the clear
            Assert.AreEqual(env.Service.ExcludedProperties.Count, 0);
            Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

            // Verify that the call was not passed to the underlying realtime server
            await env.RealtimeServer.Received(0).DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
        }

        [Test]
        public async Task ConnectAsync_UsesUnderlyingRealtimeServer()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            await env.Service.ConnectAsync();

            // Verify
            await env.RealtimeServer.Received(1).ConnectAsync();
        }

        [Test]
        public async Task CreateDocAsync_QueuesAction()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;
            string collection = "test_project";
            string id = "id1";
            var data = new TestProject
            {
                Id = id,
                Name = "Test Project 1",
            };
            string otTypeName = OTType.Json0;

            // SUT
            var result = await env.Service.CreateDocAsync(handle, collection, id, data, otTypeName);

            // Verify result
            Assert.AreEqual(result.Version, 1);
            Assert.AreEqual(result.Data, data);

            // Verify queue
            Assert.AreEqual(env.Service.QueuedOperations.Count, 1);
            QueuedOperation queuedOperation = env.Service.QueuedOperations.First();
            Assert.AreEqual(queuedOperation.Action, QueuedAction.Create);
            Assert.AreEqual(queuedOperation.Collection, collection);
            Assert.AreEqual(queuedOperation.Data, data);
            Assert.AreEqual(queuedOperation.Handle, handle);
            Assert.AreEqual(queuedOperation.Id, id);
            Assert.AreEqual(queuedOperation.OtTypeName, otTypeName);

            // Verify that the call was not passed to the underlying realtime server
            await env.RealtimeServer.Received(0).CreateDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>(), Arg.Any<string>());
        }

        [Test]
        public async Task DeleteDocAsync_QueuesAction()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;
            string collection = "test_project";
            string id = "id1";

            // SUT
            await env.Service.DeleteDocAsync(handle, collection, id);

            // Verify queue
            Assert.AreEqual(env.Service.QueuedOperations.Count, 1);
            QueuedOperation queuedOperation = env.Service.QueuedOperations.First();
            Assert.AreEqual(queuedOperation.Action, QueuedAction.Delete);
            Assert.AreEqual(queuedOperation.Collection, collection);
            Assert.AreEqual(queuedOperation.Handle, handle);
            Assert.AreEqual(queuedOperation.Id, id);

            // Verify that the call was not passed to the underlying realtime server
            await env.RealtimeServer.Received(0).DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
        }

        [Test]
        public void Disconnect_UsesUnderlyingRealtimeServer()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;

            // SUT
            env.Service.Disconnect(handle);

            // Verify
            env.RealtimeServer.Received(1).Disconnect(handle);
        }

        [Test]
        public void ExcludePropertyFromTransaction_DeconstructsTheProperty()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            env.Service.ExcludePropertyFromTransaction<TestProject>(op => op.SyncDisabled);

            // Verify
            Assert.AreEqual(env.Service.ExcludedProperties.Count, 1);
            Assert.AreEqual(env.Service.ExcludedProperties.First(), "testproject.syncdisabled");
        }

        [Test]
        public async Task FetchDocAsync_UsesUnderlyingRealtimeServer()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;
            string collection = "test_project";
            string id = "id1";

            // SUT
            await env.Service.FetchDocAsync<TestProject>(handle, collection, id);

            // Verify
            await env.RealtimeServer.Received(1).FetchDocAsync<TestProject>(handle, collection, id);
        }

        [Test]
        public void Start_UsesUnderlyingRealtimeServer()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            env.Service.Start(null);

            // Verify
            env.RealtimeServer.Received(1).Start(null);
        }

        [Test]
        public void Stop_UsesUnderlyingRealtimeServer()
        {
            // Setup
            var env = new TestEnvironment();

            // SUT
            env.Service.Stop();

            // Verify
            env.RealtimeServer.Received(1).Stop();
        }

        [Test]
        public async Task SubmitOpAsync_ExecutesExcludedAction()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;
            string collection = "test_project";
            string id = "id1";
            var data = new TestProject()
            {
                Id = id,
                SyncDisabled = false,
            };
            var snapshot = new Snapshot<TestProject>
            {
                Data = new TestProject()
                {
                    Id = id,
                    SyncDisabled = true,
                },
                Version = 2,
            };
            var builder = new Json0OpBuilder<TestProject>(data);
            builder.Set(p => p.SyncDisabled, true);
            List<Json0Op> op = builder.Op;
            env.RealtimeServer.SubmitOpAsync<TestProject>(handle, collection, id, op).Returns(Task.FromResult(snapshot));

            // SUT
            env.Service.ExcludePropertyFromTransaction<TestProject>(p => p.SyncDisabled);
            var result = await env.Service.SubmitOpAsync<TestProject>(handle, collection, id, op);

            // Verify result
            Assert.AreEqual(result.Version, snapshot.Version);
            Assert.AreEqual(result.Data, snapshot.Data);

            // Verify queue
            Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

            // Verify that the call was passed to the underlying realtime server
            await env.RealtimeServer.Received(1).SubmitOpAsync<TestProject>(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>());
        }

        [Test]
        public async Task SubmitOpAsync_QueuesAction()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;
            string collection = "test_project";
            string id = "id1";
            string otTypeName = OTType.Json0;
            var snapshot = new Snapshot<TestProject>
            {
                Data = new TestProject()
                {
                    Id = id,
                    SyncDisabled = false,
                },
                Version = 1,
            };
            var builder = new Json0OpBuilder<TestProject>(snapshot.Data);
            builder.Set(p => p.SyncDisabled, true);
            List<Json0Op> op = builder.Op;
            var updatedData = new TestProject()
            {
                Id = id,
                SyncDisabled = true,
            };

            env.RealtimeServer.FetchDocAsync<TestProject>(handle, collection, id).Returns(Task.FromResult(snapshot));
            env.RealtimeServer.ApplyOpAsync(otTypeName, snapshot.Data, op).Returns(Task.FromResult(updatedData));

            // SUT
            var result = await env.Service.SubmitOpAsync<TestProject>(handle, collection, id, op);

            // Verify result
            Assert.AreEqual(result.Version, 2);
            Assert.AreEqual(result.Data, updatedData);

            // Verify queue
            Assert.AreEqual(env.Service.QueuedOperations.Count, 1);
            QueuedOperation queuedOperation = env.Service.QueuedOperations.First();
            Assert.AreEqual(queuedOperation.Action, QueuedAction.Submit);
            Assert.AreEqual(queuedOperation.Collection, collection);
            Assert.AreEqual(queuedOperation.Handle, handle);
            Assert.AreEqual(queuedOperation.Op, op);

            // Verify that the call was not passed to the underlying realtime server
            await env.RealtimeServer.Received(0).SubmitOpAsync<TestProject>(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>());
        }

        [Test]
        public async Task SubmitOperationsAsync_ClearsExcludedProperties()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;
            string collection = "test_project";
            string id = "id1";

            // Set up excluded operations and queue
            env.Service.ExcludePropertyFromTransaction<TestProject>(op => op.SyncDisabled);
            await env.Service.DeleteDocAsync(handle, collection, id);

            // Verify excluded operations and queue
            Assert.AreEqual(env.Service.ExcludedProperties.Count, 1);
            Assert.AreEqual(env.Service.QueuedOperations.Count, 1);

            // SUT
            await env.Service.SubmitOperationsAsync();

            // Verify the clear
            Assert.AreEqual(env.Service.ExcludedProperties.Count, 0);
            Assert.AreEqual(env.Service.QueuedOperations.Count, 0);

            // Verify that the call was passed to the underlying realtime server
            await env.RealtimeServer.Received(1).DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
        }

        [Test]
        public async Task SubmitOperationsAsync_UsesUnderlyingRealtimeServer()
        {
            // Setup
            var env = new TestEnvironment();
            int handle = 1;
            string collection = "test_project";
            string id = "id1";
            string otTypeName = OTType.Json0;
            var snapshot = new Snapshot<TestProject>
            {
                Data = new TestProject()
                {
                    Id = id,
                    SyncDisabled = false,
                },
                Version = 1,
            };
            var builder = new Json0OpBuilder<TestProject>(snapshot.Data);
            builder.Set(p => p.SyncDisabled, true);
            List<Json0Op> op = builder.Op;
            var updatedData = new TestProject()
            {
                Id = id,
                SyncDisabled = true,
            };

            env.RealtimeServer.FetchDocAsync<TestProject>(handle, collection, id).Returns(Task.FromResult(snapshot));
            env.RealtimeServer.ApplyOpAsync(otTypeName, snapshot.Data, op).Returns(Task.FromResult(updatedData));

            // Setup Queue
            await env.Service.CreateDocAsync(handle, collection, id, snapshot.Data, otTypeName);
            await env.Service.SubmitOpAsync<TestProject>(handle, collection, id, op);
            await env.Service.DeleteDocAsync(handle, collection, id);

            // Verify Queue
            Assert.AreEqual(env.Service.QueuedOperations.First().Action, QueuedAction.Create);
            Assert.AreEqual(env.Service.QueuedOperations.Skip(1).First().Action, QueuedAction.Submit);
            Assert.AreEqual(env.Service.QueuedOperations.Last().Action, QueuedAction.Delete);

            // SUT
            await env.Service.SubmitOperationsAsync();

            // Verify Submit Operations
            await env.RealtimeServer.Received(1).CreateDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>(), Arg.Any<string>());
            await env.RealtimeServer.Received(1).DeleteDocAsync(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>());
            await env.RealtimeServer.Received(1).SubmitOpAsync<object>(Arg.Any<int>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<object>());
        }

        private class TestEnvironment
        {
            public QueuedRealtimeServer Service = null;
            public IRealtimeServer RealtimeServer = null;
            public TestEnvironment()
            {
                RealtimeServer = Substitute.For<IRealtimeServer>();
                Service = new QueuedRealtimeServer(RealtimeServer);
            }
        }
    }
}
