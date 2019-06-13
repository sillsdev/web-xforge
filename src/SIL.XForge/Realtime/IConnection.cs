using System;
using System.Threading.Tasks;

namespace SIL.XForge.Realtime
{
    public interface IConnection : IDisposable
    {
        Task StartAsync();
        IDocument<TData> Get<TData>(string type, string id);
    }
}
