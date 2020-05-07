using System.Collections.Generic;

namespace SIL.XForge.Scripture.Services
{
    public static class SubstituteDictionaryCache
    {
        /// <summary> Gets a dictionary cache that never returns its contents. </summary>
        public static Dictionary<TKey, TVal> ValuesNeverFoundCache<TKey, TVal>()
        {
            return new Dictionary<TKey, TVal>(new SubstituteComparer<TKey>());
        }
    }

    class SubstituteComparer<T> : IEqualityComparer<T>
    {
        // Always return false
        public bool Equals(T key1, T key2)
        {
            return false;
        }

        // Needed to implement interface
        public int GetHashCode(T key)
        {
            return 54321;
        }
    }
}
