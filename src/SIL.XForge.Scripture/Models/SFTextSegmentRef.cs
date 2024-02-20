using System;
using System.Collections.Generic;
using System.Linq;
using SIL.Extensions;

namespace SIL.XForge.Scripture.Models;

public readonly struct SFTextSegmentRef(IReadOnlyList<string> keys)
    : IEquatable<SFTextSegmentRef>,
        IComparable<SFTextSegmentRef>,
        IComparable
{
    public IReadOnlyList<string> Keys { get; } = keys;

    public override readonly bool Equals(object obj) => Equals((SFTextSegmentRef)obj);

    public override readonly int GetHashCode() => Keys.GetSequenceHashCode();

    public readonly bool Equals(SFTextSegmentRef other) => Keys.SequenceEqual(other.Keys);

    public readonly int CompareTo(SFTextSegmentRef other)
    {
        for (int i = 0; i < Keys.Count && i < other.Keys.Count; i++)
        {
            string key = Keys[i];
            string otherKey = other.Keys[i];
            if (key != otherKey)
            {
                // if both keys are numbers, compare numerically
                if (int.TryParse(key, out int intKey) && int.TryParse(otherKey, out int intOtherKey))
                    return intKey.CompareTo(intOtherKey);
                return string.Compare(key, otherKey, StringComparison.Ordinal);
            }
        }
        return Keys.Count.CompareTo(other.Keys.Count);
    }

    public readonly int CompareTo(object obj)
    {
        if (obj is not SFTextSegmentRef textSegmentRef)
            throw new ArgumentException("The specified object is not a SFTextSegmentRef.", nameof(obj));
        return CompareTo(textSegmentRef);
    }

    public override readonly string ToString() => string.Join(".", Keys);
}
