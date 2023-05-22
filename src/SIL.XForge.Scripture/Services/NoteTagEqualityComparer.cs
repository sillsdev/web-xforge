using System;
using System.Collections.Generic;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class NoteTagEqualityComparer : IEqualityComparer<NoteTag>
{
    public bool Equals(NoteTag? x, NoteTag? y) =>
        x?.TagId == y?.TagId && x?.Icon == y?.Icon && x?.Name == y?.Name && x?.CreatorResolve == y?.CreatorResolve;

    public int GetHashCode(NoteTag? obj) =>
        obj is null ? 0 : HashCode.Combine(obj.TagId, obj.Icon, obj.Name, obj.CreatorResolve);
}
