using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Websocket.Client;

namespace ShareDB
{
    internal enum OpMessageType
    {
        Op,
        Create,
        Delete
    }

    public class Connection : IConnection, IDisposable
    {
        private readonly Uri _uri;
        private readonly WebsocketClient _socket;
        private readonly Dictionary<string, Dictionary<string, IDocumentInternal>> _collections;
        private IDisposable _subscription;
        private TaskCompletionSource<bool> _initTcs;
        private string _id;
        private int _nextSeq;

        public Connection(Uri uri)
        {
            _uri = uri;
            _socket = new WebsocketClient(_uri) { ReconnectTimeoutMs = int.MaxValue };
            _collections = new Dictionary<string, Dictionary<string, IDocumentInternal>>();
            _nextSeq = 1;
        }

        internal int NextSeq()
        {
            return _nextSeq++;
        }

        public async Task StartAsync()
        {
            _initTcs = new TaskCompletionSource<bool>();
            _subscription = _socket.MessageReceived.Subscribe(msg => HandleMessage(JObject.Parse(msg.Text)));
            await _socket.Start();
            await _initTcs.Task;
        }

        public IDocument<T> Get<T>(string collection, string id)
        {
            if (!_collections.TryGetValue(collection, out Dictionary<string, IDocumentInternal> docs))
            {
                docs = new Dictionary<string, IDocumentInternal>();
                _collections[collection] = docs;
            }

            if (!docs.TryGetValue(id, out IDocumentInternal doc))
            {
                if (!OTTypes.TryGetType(typeof(T), out IOTType type))
                    type = null;
                doc = new Document<T>(this, collection, id, type);
                docs[id] = doc;
            }
            return (Document<T>)doc;
        }

        private IDocumentInternal GetExisting(string collection, string id)
        {
            return _collections[collection][id];
        }

        internal Task SendFetchAsync(IDocumentInternal doc)
        {
            var msg = new JObject(
                new JProperty("a", "f"),
                new JProperty("c", doc.Collection),
                new JProperty("d", doc.Id),
                new JProperty("v", doc.Version < 0 ? null : (int?)doc.Version));
            return _socket.Send(msg.ToString());
        }

        internal Task SendOpAsync(IDocumentInternal doc, OpMessageType msgType, int seq, JToken op)
        {
            var msg = new JObject(
                new JProperty("a", "op"),
                new JProperty("c", doc.Collection),
                new JProperty("d", doc.Id),
                new JProperty("v", doc.Version < 0 ? null : (int?)doc.Version),
                new JProperty("src", _id),
                new JProperty("seq", seq));

            switch (msgType)
            {
                case OpMessageType.Op:
                    msg["op"] = op.DeepClone();
                    break;
                case OpMessageType.Create:
                    msg["create"] = new JObject(
                        new JProperty("type", doc.Type.Uri.ToString()),
                        new JProperty("data", op.DeepClone()));
                    break;
                case OpMessageType.Delete:
                    msg["del"] = true;
                    break;
            }
            return _socket.Send(msg.ToString());
        }

        private void HandleMessage(JObject msg)
        {
            ShareDBException ex = null;
            var error = (JObject)msg["error"];
            if (error != null)
                ex = new ShareDBException((string)error["message"], (int)error["code"]);

            IDocumentInternal doc;
            switch ((string)msg["a"])
            {
                case "init":
                    if ((int)msg["protocol"] != 1)
                    {
                        _initTcs.SetException(new ShareDBException("Invalid protocol version.", 4019));
                        return;
                    }
                    if ((string)msg["type"] != "http://sharejs.org/types/JSONv0")
                    {
                        _initTcs.SetException(new ShareDBException("Invalid default type.", 4020));
                        return;
                    }
                    if (msg["id"].Type != JTokenType.String)
                    {
                        _initTcs.SetException(new ShareDBException("Invalid client id.", 4021));
                        return;
                    }

                    _id = (string)msg["id"];
                    _initTcs.SetResult(true);
                    break;

                case "f":
                    doc = GetExisting((string)msg["c"], (string)msg["d"]);
                    var snapshot = (JObject)msg["data"];
                    doc.HandleFetch(ex, (int?)snapshot?["v"] ?? 0, (string)snapshot?["type"], snapshot?["data"]);
                    break;

                case "op":
                    doc = GetExisting((string)msg["c"], (string)msg["d"]);
                    doc.HandleOp(ex, (int?)msg["v"] ?? 0, (int?)msg["seq"] ?? 0);
                    break;
            }
        }

        #region IDisposable Support
        private bool disposedValue = false; // To detect redundant calls

        protected virtual void Dispose(bool disposing)
        {
            if (!disposedValue)
            {
                if (disposing)
                {
                    _subscription?.Dispose();
                    _socket.Dispose();
                }

                disposedValue = true;
            }
        }

        // This code added to correctly implement the disposable pattern.
        public void Dispose()
        {
            // Do not change this code. Put cleanup code in Dispose(bool disposing) above.
            Dispose(true);
        }
        #endregion
    }
}
