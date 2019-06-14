using System.Collections.Generic;
using System.Threading.Tasks;

namespace SIL.XForge.Realtime
{
    public interface IDocument<TData, TOp>
    {
        string Collection { get; }
        string Id { get; }
        int Version { get; }
        string Type { get; }
        TData Data { get; }
        bool IsLoaded { get; }

        Task CreateAsync(TData data, string type);

        Task FetchAsync();

        Task SubmitOpAsync(TOp op);
        Task SubmitOpsAsync(IEnumerable<TOp> ops);

        Task DeleteAsync();
    }
}
