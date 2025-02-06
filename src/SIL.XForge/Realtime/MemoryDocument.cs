using System;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Realtime;

[ExcludeFromCodeCoverage(Justification = "This code is only used in unit tests")]
public class MemoryDocument<T>(MemoryRepository<T> repo, string otTypeName, string collection, string id) : IDocument<T>
    where T : IIdentifiable
{
    public string Collection { get; } = collection;

    public string Id { get; } = id;

    public int Version { get; private set; }

    public string OTTypeName { get; } = otTypeName;

    public T Data { get; private set; }

    public bool IsLoaded => Data != null;

    public async Task CreateAsync(T data)
    {
        if (IsLoaded)
            throw new InvalidOperationException("The doc already exists.");
        data.Id = Id;
        await repo.InsertAsync(data);
        Data = data;
        Version = 0;
    }

    public async Task DeleteAsync()
    {
        if (!repo.Contains(Id))
        {
            throw new Jering.Javascript.NodeJS.InvocationException(
                "Document does not exist",
                "Would be received in production."
            );
        }
        await repo.DeleteAsync(Id);
        Data = default;
        Version = -1;
    }

    public async Task FetchAsync()
    {
        Attempt<T> attempt = await repo.TryGetAsync(Id);
        if (attempt.TryResult(out T data))
        {
            Data = data;
            Version = 0;
        }
    }

    public async Task FetchOrCreateAsync(Func<T> createData)
    {
        await FetchAsync();
        if (!IsLoaded)
            await CreateAsync(createData());
    }

    public async Task SubmitOpAsync(object op, OpSource? source)
    {
        T data = await MemoryRealtimeService.Server.ApplyOpAsync(OTTypeName, Data, op);
        data.Id = Id;
        await repo.ReplaceAsync(data);
        Data = data;
        Version++;
    }

    public async Task ReplaceAsync(T data, OpSource? source)
    {
        data.Id = Id;
        await repo.ReplaceAsync(data);
        Data = data;
        Version++;
    }
}
