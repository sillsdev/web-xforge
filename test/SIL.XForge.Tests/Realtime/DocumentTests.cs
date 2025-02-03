using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

[TestFixture]
public class DocumentTests
{
    // Values used for tests
    private const string Collection = "collection_name";
    private const string Id = "id1";
    private const string OtTypeName = OTType.Json0;
    private const OpSource Source = OpSource.Draft;
    private const int Version = 1;
    private static readonly Json0Snapshot _data = new Json0Snapshot { Id = Id };
    private static readonly Op _op = new Op();
    private static readonly Snapshot<Json0Snapshot> _snapshot = new Snapshot<Json0Snapshot>
    {
        Data = _data,
        Id = Id,
        Version = Version,
    };

    [Test]
    public async Task CreateAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Document.CreateAsync(_data);

        await env.Connection.Received(1).CreateDocAsync(Collection, Id, _data, OtTypeName);
    }

    [Test]
    public async Task DeleteAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Document.DeleteAsync();

        await env.Connection.Received(1).DeleteDocAsync(Collection, Id);
    }

    [Test]
    public async Task FetchAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Document.FetchAsync();

        await env.Connection.Received(1).FetchDocAsync<Json0Snapshot>(Collection, Id);
    }

    [Test]
    public async Task FetchAsyncOrCreate_Creates()
    {
        var env = new TestEnvironment();
        env.Connection.FetchDocAsync<Json0Snapshot>(Collection, Id)
            .Returns(Task.FromResult(new Snapshot<Json0Snapshot>()));

        // SUT
        await env.Document.FetchOrCreateAsync(() => _data);

        await env.Connection.Received(1).FetchDocAsync<Json0Snapshot>(Collection, Id);
        await env.Connection.Received(1).CreateDocAsync(Collection, Id, _data, OtTypeName);
    }

    [Test]
    public async Task FetchAsyncOrCreate_Fetches()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Document.FetchOrCreateAsync(() => _data);

        await env.Connection.Received(1).FetchDocAsync<Json0Snapshot>(Collection, Id);
        await env.Connection.Received(0).CreateDocAsync(Collection, Id, _data, OtTypeName);
    }

    [Test]
    public async Task ReplaceAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Document.ReplaceAsync(_data, Source);

        await env.Connection.Received(1).ReplaceDocAsync(Collection, Id, _data, Version, Source);
    }

    [Test]
    public async Task SubmitOpAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Document.SubmitOpAsync(_op, Source);

        await env.Connection.Received(1).SubmitOpAsync(Collection, Id, _op, _data, Version, Source);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            Document = new Document<Json0Snapshot>(Connection, OtTypeName, Collection, Id, _snapshot);

            // Set up return values for the connection functions
            Connection.CreateDocAsync(Collection, Id, _data, OtTypeName).Returns(Task.FromResult(_snapshot));
            Connection.FetchDocAsync<Json0Snapshot>(Collection, Id).Returns(Task.FromResult(_snapshot));
            Connection.ReplaceDocAsync(Collection, Id, _data, Version, Source).Returns(Task.FromResult(_snapshot));
            Connection.SubmitOpAsync(Collection, Id, _op, _data, Version, Source).Returns(Task.FromResult(_snapshot));
        }

        public IConnection Connection { get; } = Substitute.For<IConnection>();
        public Document<Json0Snapshot> Document { get; }
    }
}
