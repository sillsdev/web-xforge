using System;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

public interface IDocument<T> where T : IIdentifiable
{
    string Collection { get; }
    string Id { get; }
    int Version { get; }
    string OTTypeName { get; }
    T Data { get; }
    bool IsLoaded { get; }

    Task CreateAsync(T data);

    Task FetchAsync();

    Task FetchOrCreateAsync(Func<T> createData);

    Task SubmitOpAsync(object op);

    Task DeleteAsync();
}
