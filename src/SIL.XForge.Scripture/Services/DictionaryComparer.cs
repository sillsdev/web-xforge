using System;
using System.Collections.Generic;
using System.Linq;

namespace SIL.XForge.Scripture.Services
{
    public class DictionaryComparer<TKey, TValue> : IEqualityComparer<Dictionary<TKey, TValue>>
    {
        public bool Equals(Dictionary<TKey, TValue> x, Dictionary<TKey, TValue> y)
        {
            return (x ?? new Dictionary<TKey, TValue>())
                .OrderBy(p => p.Key)
                .SequenceEqual((y ?? new Dictionary<TKey, TValue>()).OrderBy(p => p.Key));
        }

        public int GetHashCode(Dictionary<TKey, TValue> obj)
        {
            int hash = 0;
            if (obj != null)
            {
                foreach (KeyValuePair<TKey, TValue> element in obj)
                {
                    hash ^= element.Key.GetHashCode();
                    hash ^= element.Value.GetHashCode();
                }
            }

            return hash;
        }
    }
}
