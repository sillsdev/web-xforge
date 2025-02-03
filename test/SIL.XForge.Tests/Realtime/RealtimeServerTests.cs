using System;
using System.Threading.Tasks;
using Jering.Javascript.NodeJS;
using NSubstitute;
using NUnit.Framework;

namespace SIL.XForge.Realtime;

[TestFixture]
public class RealtimeServerTests
{
    [Test]
    public async Task ApplyOpAsync_Success()
    {
        var env = new TestEnvironment();
        object data = new { };
        object op = new { };

        // SUT
        await env.Service.ApplyOpAsync(OTType.Json0, data, op);

        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<object>(Arg.Any<string>(), "applyOp", Arg.Any<object[]>());
    }

    [Test]
    public async Task CreateDocAsync_Success()
    {
        var env = new TestEnvironment();
        object data = new { };

        // SUT
        await env.Service.CreateDocAsync(0, string.Empty, string.Empty, data, OTType.Json0);

        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<Snapshot<object>>(Arg.Any<string>(), "createDoc", Arg.Any<object[]>());
    }

    [Test]
    public async Task ConnectAsync_NoUser()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.ConnectAsync();

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync<int>(Arg.Any<string>(), "connect", Arg.Any<object[]>());
    }

    [Test]
    public async Task ConnectAsync_Success()
    {
        var env = new TestEnvironment();
        const string userId = "user01";

        // SUT
        await env.Service.ConnectAsync(userId);

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync<int>(Arg.Any<string>(), "connect", Arg.Any<object[]>());
    }

    [Test]
    public async Task DeleteDocAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.DeleteDocAsync(0, string.Empty, string.Empty);

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync(Arg.Any<string>(), "deleteDoc", Arg.Any<object[]>());
    }

    [Test]
    public async Task Disconnect_Success()
    {
        var env = new TestEnvironment();

        // SUT
        env.Service.Disconnect(0);

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync(Arg.Any<string>(), "disconnect", Arg.Any<object[]>());
    }

    [Test]
    public async Task DisconnectAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.DisconnectAsync(0);

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync(Arg.Any<string>(), "disconnect", Arg.Any<object[]>());
    }

    [Test]
    public async Task FetchDocAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.FetchDocAsync<object>(0, string.Empty, string.Empty);

        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<Snapshot<object>>(Arg.Any<string>(), "fetchDoc", Arg.Any<object[]>());
    }

    [Test]
    public async Task FetchDocsAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.FetchDocsAsync<object>(0, string.Empty, []);

        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<Snapshot<object>[]>(Arg.Any<string>(), "fetchDocs", Arg.Any<object[]>());
    }

    [Test]
    public async Task FetchSnapshotAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.FetchSnapshotAsync<object>(0, string.Empty, string.Empty, DateTime.MinValue);

        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<Snapshot<object>>(Arg.Any<string>(), "fetchSnapshotByTimestamp", Arg.Any<object[]>());
    }

    [Test]
    public async Task GetOpsAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.GetOpsAsync(string.Empty, string.Empty);

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync<Op[]>(Arg.Any<string>(), "getOps", Arg.Any<object[]>());
    }

    [Test]
    public async Task IsServerRunning_Success()
    {
        var env = new TestEnvironment();
        env.Service.Start(options: new { });
        env.NodeJsProcess.InvokeFromFileAsync<bool>(Arg.Any<string>(), "isServerRunning", Arg.Any<object[]>())
            .Returns(true);

        // SUT
        bool actual = env.Service.IsServerRunning();
        Assert.IsTrue(actual);

        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<bool>(Arg.Any<string>(), "isServerRunning", Arg.Any<object[]>());
    }

    [Test]
    public async Task IsServerRunning_WillReturnFalseIfNotStarted()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.IsServerRunning();
        Assert.IsFalse(actual);

        await env
            .NodeJsProcess.Received(0)
            .InvokeFromFileAsync<bool>(Arg.Any<string>(), "isServerRunning", Arg.Any<object[]>());
    }

    [Test]
    public async Task ReplaceDocAsync_Success()
    {
        var env = new TestEnvironment();
        object data = new { };

        // SUT
        await env.Service.ReplaceDocAsync(0, string.Empty, string.Empty, data, null);

        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<Snapshot<object>>(Arg.Any<string>(), "replaceDoc", Arg.Any<object[]>());
    }

    [Test]
    public async Task Restart_Success()
    {
        var env = new TestEnvironment();
        env.NodeJsProcess.InvokeFromFileAsync<bool>(Arg.Any<string>(), "isServerRunning", Arg.Any<object[]>())
            .Returns(true);

        // SUT
        bool actual = env.Service.Restart(options: new { });
        Assert.IsTrue(actual);

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync(Arg.Any<string>(), "start", Arg.Any<object[]>());
        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<bool>(Arg.Any<string>(), "isServerRunning", Arg.Any<object[]>());
    }

    [Test]
    public async Task Start_Success()
    {
        var env = new TestEnvironment();

        // SUT
        env.Service.Start(options: new { });

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync(Arg.Any<string>(), "start", Arg.Any<object[]>());
    }

    [Test]
    public async Task Start_WillNotStartTwice()
    {
        var env = new TestEnvironment();

        // SUT
        env.Service.Start(options: new { });
        env.Service.Start(options: new { });

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync(Arg.Any<string>(), "start", Arg.Any<object[]>());
    }

    [Test]
    public async Task Stop_Success()
    {
        var env = new TestEnvironment();
        env.Service.Start(options: new { });

        // SUT
        env.Service.Stop();

        await env.NodeJsProcess.Received(1).InvokeFromFileAsync(Arg.Any<string>(), "stop", Arg.Any<object[]>());
    }

    [Test]
    public async Task Stop_WillNotStopIfNotStarted()
    {
        var env = new TestEnvironment();

        // SUT
        env.Service.Stop();

        await env.NodeJsProcess.Received(0).InvokeFromFileAsync(Arg.Any<string>(), "stop", Arg.Any<object[]>());
    }

    [Test]
    public async Task SubmitOpAsync_Success()
    {
        var env = new TestEnvironment();
        object op = new { };

        // SUT
        await env.Service.SubmitOpAsync<object>(0, string.Empty, string.Empty, op, null);

        await env
            .NodeJsProcess.Received(1)
            .InvokeFromFileAsync<Snapshot<object>>(Arg.Any<string>(), "submitOp", Arg.Any<object[]>());
    }

    private class TestEnvironment
    {
        public TestEnvironment() => Service = new RealtimeServer(NodeJsProcess);

        public INodeJSService NodeJsProcess { get; } = Substitute.For<INodeJSService>();
        public RealtimeServer Service { get; }
    }
}
