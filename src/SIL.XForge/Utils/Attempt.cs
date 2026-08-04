#nullable disable warnings
using System.Diagnostics.CodeAnalysis;

namespace SIL.XForge.Utils;

public static class Attempt
{
    public static Attempt<T> Success<T>(T result) => new Attempt<T>(true, result);

    public static Attempt<T> Failure<T>(T result) => new Attempt<T>(false, result);
}

public readonly struct Attempt<T>(bool success, T result = default)
{
    public static Attempt<T> Failure { get; } = new Attempt<T>();

    public Attempt(T result)
        : this(true, result) { }

    public T Result { get; } = result;
    public bool Success { get; } = success;

    public bool TryResult([NotNullWhen(true)] out T result)
    {
        result = Result;
        return Success;
    }
}
