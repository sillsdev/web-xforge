using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace SIL.XForge.Realtime.RichText;

public class DeltaEqualityComparer : IEqualityComparer<Delta>
{
    public bool Equals(Delta x, Delta y) => x == y || (x != null && y != null && x.DeepEquals(y));

    public int GetHashCode(Delta obj)
    {
        if (obj == null)
            return 0;

        return obj.Ops.Aggregate(23, (code, op) => code * 31 + JToken.EqualityComparer.GetHashCode(op));
    }
}
