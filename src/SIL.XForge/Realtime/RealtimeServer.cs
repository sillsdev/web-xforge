using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNetCore.NodeServices;

namespace SIL.XForge.Realtime
{
    public class RealtimeServer
    {
        private readonly INodeServices _nodeServices;
        private readonly string _modulePath;
        private bool _started;

        public RealtimeServer(INodeServices nodeServices)
        {
            _nodeServices = nodeServices;
            _modulePath = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),
                "RealtimeServer", "lib", "common", "index");
        }

        public void Start(object options)
        {
            if (_started)
                return;
            InvokeExportAsync<object>("start", options).GetAwaiter().GetResult();
            _started = true;
        }

        public void Stop()
        {
            if (!_started)
                return;
            InvokeExportAsync<object>("stop").GetAwaiter().GetResult();
            _started = false;
        }

        public Task<int> ConnectAsync()
        {
            return InvokeExportAsync<int>("connect");
        }

        public Task<Snapshot<T>> CreateDocAsync<T>(int handle, string collection, string id, T data, string otTypeName)
        {
            return InvokeExportAsync<Snapshot<T>>("createDoc", handle, collection, id, data, otTypeName);
        }

        public Task<Snapshot<T>> FetchDocAsync<T>(int handle, string collection, string id)
        {
            return InvokeExportAsync<Snapshot<T>>("fetchDoc", handle, collection, id);
        }

        public Task<Snapshot<T>> SubmitOpAsync<T>(int handle, string collection, string id, object op)
        {
            return InvokeExportAsync<Snapshot<T>>("submitOp", handle, collection, id, op);
        }

        public Task DeleteDocAsync(int handle, string collection, string id)
        {
            return InvokeExportAsync<object>("deleteDoc", handle, collection, id);
        }

        public void Disconnect(int handle)
        {
            InvokeExportAsync<object>("disconnect", handle).GetAwaiter().GetResult();
        }

        public Task<T> ApplyOpAsync<T>(string otTypeName, T data, object op)
        {
            return InvokeExportAsync<T>("applyOp", otTypeName, data, op);
        }

        private Task<T> InvokeExportAsync<T>(string exportedFunctionName, params object[] args)
        {
            return _nodeServices.InvokeExportAsync<T>(_modulePath, exportedFunctionName, args);
        }
    }
}
