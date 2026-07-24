using System.Collections.Generic;
using SIL.ObjectModel;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Compares two lists element-by-element like <see cref="SequenceEqualityComparer" />, but tolerates null lists.
/// Two null lists are equal; a null list is never equal to a non-null list (even an empty one).
/// </summary>
public class NullableSequenceEqualityComparer<T> : IEqualityComparer<IList<T>?>
{
    private static readonly IEqualityComparer<IList<T>> _comparer = SequenceEqualityComparer.Create(
        EqualityComparer<T>.Default
    );

    public bool Equals(IList<T>? x, IList<T>? y) => x is null ? y is null : y is not null && _comparer.Equals(x, y);

    public int GetHashCode(IList<T>? obj) => obj is null ? 0 : _comparer.GetHashCode(obj);
}
