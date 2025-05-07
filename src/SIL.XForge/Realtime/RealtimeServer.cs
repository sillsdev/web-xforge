using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using Jering.Javascript.NodeJS;

namespace SIL.XForge.Realtime;

public class RealtimeServer : IRealtimeServer
{
    private readonly INodeJSService _nodeJSService;
    private readonly string _modulePath;
    private bool _started;

    public RealtimeServer(INodeJSService nodeJSService)
    {
        _nodeJSService = nodeJSService;
        if (Product.RunningInContainer)
        {
            // Path to realtime server index file in the realtimeserver docker container.
            _modulePath = Path.Join("/app", "lib", "cjs", "common", "index.js");
        }
        else
        {
            string assemblyDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? string.Empty;
            _modulePath = Path.Join(assemblyDirectory, "RealtimeServer", "lib", "cjs", "common", "index.js");
        }
    }

    public void Start(object options)
    {
        if (_started)
            return;
        InvokeExportAsync("start", options).GetAwaiter().GetResult();
        _started = true;
    }

    public void Stop()
    {
        if (!_started)
            return;
        InvokeExportAsync("stop").GetAwaiter().GetResult();
        _started = false;
    }

    public bool IsServerRunning()
    {
        if (!_started)
            return false;

        return InvokeExportAsync<bool>("isServerRunning").GetAwaiter().GetResult();
    }

    public bool Restart(object options)
    {
        _started = false;
        Start(options);
        return IsServerRunning();
    }

    public Task<int> ConnectAsync(string? userId = null)
    {
        if (userId != null)
            return InvokeExportAsync<int>("connect", userId);
        return InvokeExportAsync<int>("connect");
    }

    public Task<Snapshot<T>> CreateDocAsync<T>(int handle, string collection, string id, T data, string otTypeName) =>
        InvokeExportAsync<Snapshot<T>>("createDoc", handle, collection, id, data, otTypeName);

    public Task<Snapshot<T>> FetchDocAsync<T>(int handle, string collection, string id) =>
        InvokeExportAsync<Snapshot<T>>("fetchDoc", handle, collection, id);

    public Task<Snapshot<T>[]> FetchDocsAsync<T>(int handle, string collection, IReadOnlyCollection<string> ids) =>
        InvokeExportAsync<Snapshot<T>[]>("fetchDocs", handle, collection, ids);

    public Task<Snapshot<T>> FetchSnapshotAsync<T>(int handle, string collection, string id, DateTime timestamp) =>
        InvokeExportAsync<Snapshot<T>>(
            "fetchSnapshotByTimestamp",
            handle,
            collection,
            id,
            new DateTimeOffset(timestamp, TimeSpan.Zero).ToUnixTimeMilliseconds()
        );

    public Task<Op[]> GetOpsAsync(string collection, string id) => InvokeExportAsync<Op[]>("getOps", collection, id);

    public Task<Snapshot<T>> SubmitOpAsync<T>(int handle, string collection, string id, object op, OpSource? source) =>
        InvokeExportAsync<Snapshot<T>>("submitOp", handle, collection, id, op, source?.ToString());

    public Task DeleteDocAsync(int handle, string collection, string id) =>
        InvokeExportAsync("deleteDoc", handle, collection, id);

    public void Disconnect(int handle) => InvokeExportAsync("disconnect", handle).GetAwaiter().GetResult();

    public Task DisconnectAsync(int handle) => InvokeExportAsync("disconnect", handle);

    public Task<T> ApplyOpAsync<T>(string otTypeName, T data, object op) =>
        InvokeExportAsync<T>("applyOp", otTypeName, data, op);

    public Task<Snapshot<T>> ReplaceDocAsync<T>(int handle, string collection, string id, T data, OpSource? source) =>
        InvokeExportAsync<Snapshot<T>>("replaceDoc", handle, collection, id, data, source);

    private Task<T> InvokeExportAsync<T>(string exportedFunctionName, params object?[] args) =>
        _nodeJSService.InvokeFromFileAsync<T>(_modulePath, exportedFunctionName, args);

    private Task InvokeExportAsync(string exportedFunctionName, params object[] args) =>
        _nodeJSService.InvokeFromFileAsync(_modulePath, exportedFunctionName, args);
}
