using System.Collections.Generic;
using System.Linq;
using SIL.XForge.Utils;

namespace SIL.XForge.Realtime.Json0
{
    public static class Json0OpBuilder
    {

        public static List<Json0Op> ListInsert(this List<Json0Op> ops, IEnumerable<object> path, object item)
        {
            ops.Add(new Json0Op { Path = CreatePath(path), InsertItem = item });
            return ops;
        }

        public static List<Json0Op> ListDelete(this List<Json0Op> ops, IEnumerable<object> path, object item)
        {
            ops.Add(new Json0Op { Path = CreatePath(path), DeleteItem = item });
            return ops;
        }

        public static List<Json0Op> ListReplace(this List<Json0Op> ops, IEnumerable<object> path, object oldItem,
            object newItem)
        {
            ops.Add(new Json0Op { Path = CreatePath(path), DeleteItem = oldItem, InsertItem = newItem });
            return ops;
        }

        public static List<Json0Op> ObjectInsert(this List<Json0Op> ops, IEnumerable<object> path, object value)
        {
            ops.Add(new Json0Op { Path = CreatePath(path), InsertProp = value });
            return ops;
        }

        public static List<Json0Op> ObjectDelete(this List<Json0Op> ops, IEnumerable<object> path, object value)
        {
            ops.Add(new Json0Op { Path = CreatePath(path), DeleteProp = value });
            return ops;
        }

        public static List<Json0Op> ObjectReplace(this List<Json0Op> ops, IEnumerable<object> path, object oldValue,
            object newValue)
        {
            ops.Add(new Json0Op { Path = CreatePath(path), DeleteProp = oldValue, InsertProp = newValue });
            return ops;
        }

        private static List<object> CreatePath(IEnumerable<object> path)
        {
            return path.Select(i =>
                {
                    var str = i as string;
                    if (str != null)
                        return str.ToCamelCase();
                    return i;
                }).ToList();
        }
    }
}
