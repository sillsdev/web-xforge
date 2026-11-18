using System;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime;

public interface IDocument<T>
    where T : class, IIdentifiable
{
    string Collection { get; }
    string Id { get; }
    int Version { get; }
    string OTTypeName { get; }
    T? Data { get; }

    [MemberNotNullWhen(true, nameof(Data))]
    bool IsLoaded { get; }

    Task CreateAsync(T data, OpSource? source);

    Task FetchAsync();

    Task FetchOrCreateAsync(Func<T> createData, OpSource? source);

    Task SubmitOpAsync(object op, SubmitOptions? options);

    Task DeleteAsync();

    Task ReplaceAsync(T data, OpSource? source);
}
