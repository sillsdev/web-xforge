using System;
using System.Threading.Tasks;

namespace SIL.XForge.Realtime
{
    public interface IConnection : IDisposable
    {
        Task StartAsync();
        IDocument<TData, TOp> Get<TData, TOp>(string collection, string id);
    }
}
