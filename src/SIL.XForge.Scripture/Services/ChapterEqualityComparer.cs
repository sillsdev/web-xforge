using System;
using System.Collections.Generic;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class ChapterEqualityComparer : IEqualityComparer<Chapter>
{
    /// <inheritdoc />
    /// <remarks>
    /// We do not compare permissions, as these are modified in SFProjectService
    /// </remarks>
    public bool Equals(Chapter? x, Chapter? y) =>
        x?.Number == y?.Number && x?.LastVerse == y?.LastVerse && x?.IsValid == y?.IsValid;

    public int GetHashCode(Chapter? obj) => obj is null ? 0 : HashCode.Combine(obj.Number, obj.LastVerse, obj.IsValid);
}
