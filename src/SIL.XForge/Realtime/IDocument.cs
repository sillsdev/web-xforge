using System.Threading.Tasks;

namespace SIL.XForge.Realtime
{
    public interface IDocument<TData>
    {
        string Collection { get; }
        string Id { get; }
        int Version { get; }
        string OTTypeName { get; }
        TData Data { get; }
        bool IsLoaded { get; }

        Task CreateAsync(TData data);

        Task FetchAsync();

        Task SubmitOpAsync(object op);

        Task DeleteAsync();
    }
}
