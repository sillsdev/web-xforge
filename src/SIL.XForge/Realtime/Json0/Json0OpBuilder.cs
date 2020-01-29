using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using SIL.XForge.Utils;

namespace SIL.XForge.Realtime.Json0
{
    public class Json0OpBuilder
    {
        private readonly T _data;

        public Json0OpBuilder(T data)
        {
            _data = data;
        }

        public List<Json0Op> Op { get; } = new List<Json0Op>();

        public Json0OpBuilder<T> Insert<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem item)
        {
            var objectPath = new ObjectPath(field);
            List<object> path = objectPath.Items.ToList();
            path.Add (index);
            Op.Add(new Json0Op { Path = CreateJson0Path(path), InsertItem = item });
            return this;
        }

        public Json0OpBuilder<T> Add<TItem>(Expression<Func<T, List<TItem>>> field, TItem item)
        {
            var objectPath = new ObjectPath(field);
            if (!objectPath.TryGetValue(_data, out List < TItem > list) || list == null)
                throw new InvalidOperationException("The specified list does not exist.");
            List<object> path = objectPath.Items.ToList();
            path.Add(list.Count);
            Op.Add(new Json0Op { Path = CreateJson0Path(path), InsertItem = item });
            return this;
        }

        public Json0OpBuilder<T> Remove<TItem>(Expression<Func<T, List<TItem>>> field, int index)
        {
            var objectPath = new ObjectPath(field);
            if (!objectPath.TryGetValue(_data, out List < TItem > list) || list == null)
                throw new InvalidOperationException("The specified list does not exist.");
            List<object> path = objectPath.Items.ToList();
            path.Add (index);
            Op.Add(new Json0Op { Path = CreateJson0Path(path), DeleteItem = list[index] });
            return this;
        }

        public Json0OpBuilder<T> Remove<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem item)
        {
            var objectPath = new ObjectPath(field);
            List<object> path = objectPath.Items.ToList();
            path.Add (index);
            Op.Add(new Json0Op { Path = CreateJson0Path(path), DeleteItem = item });
            return this;
        }

        public Json0OpBuilder<T> Replace<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem newItem)
        {
            return Replace(field, index, newItem, EqualityComparer<TItem>.Default);
        }

        public Json0OpBuilder<T>
        Replace<TItem>(
            Expression<Func<T, List<TItem>>> field,
            int index,
            TItem newItem,
            IEqualityComparer<TItem> equalityComparer
        )
        {
            var objectPath = new ObjectPath(field);
            if (!objectPath.TryGetValue(_data, out List < TItem > list) || list == null)
                throw new InvalidOperationException("The specified list does not exist.");
            TItem oldItem = list[index];
            if (!equalityComparer.Equals(oldItem, newItem))
            {
                List<object> path = objectPath.Items.ToList();
                path.Add (index);
                Op.Add(new Json0Op { Path = CreateJson0Path(path), DeleteItem = oldItem, InsertItem = newItem });
            }
            return this;
        }

        public Json0OpBuilder<T>
        Replace<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem newItem, TItem oldItem)
        {
            return Replace(field, index, newItem, oldItem, EqualityComparer<TItem>.Default);
        }

        public Json0OpBuilder<T>
        Replace<TItem>(
            Expression<Func<T, List<TItem>>> field,
            int index,
            TItem newItem,
            TItem oldItem,
            IEqualityComparer<TItem> equalityComparer
        )
        {
            if (!equalityComparer.Equals(oldItem, newItem))
            {
                var objectPath = new ObjectPath(field);
                List<object> path = objectPath.Items.ToList();
                path.Add (index);
                Op.Add(new Json0Op { Path = CreateJson0Path(path), DeleteItem = oldItem, InsertItem = newItem });
            }
            return this;
        }

        public Json0OpBuilder<T> Set<TField>(Expression<Func<T, TField>> field, TField value)
        {
            return Set(field, value, EqualityComparer<TField>.Default);
        }

        public Json0OpBuilder<T>
        Set<TField>(Expression<Func<T, TField>> field, TField value, IEqualityComparer<TField> equalityComparer)
        {
            var objectPath = new ObjectPath(field);
            bool hasOldValue = objectPath.TryGetValue(_data, out TField oldValue);
            if (!hasOldValue || !equalityComparer.Equals(value, oldValue))
            {
                Op
                    .Add(new Json0Op {
                        Path = CreateJson0Path(objectPath.Items),
                        DeleteProp = hasOldValue ? (object) oldValue : null,
                        InsertProp = value
                    });
            }
            return this;
        }

        public Json0OpBuilder<T> Set<TField>(Expression<Func<T, TField>> field, TField newValue, TField oldValue)
        {
            return Set(field, newValue, oldValue, EqualityComparer<TField>.Default);
        }

        public Json0OpBuilder<T>
        Set<TField>(
            Expression<Func<T, TField>> field,
            TField newValue,
            TField oldValue,
            IEqualityComparer<TField> equalityComparer
        )
        {
            if (!equalityComparer.Equals(newValue, oldValue))
            {
                var objectPath = new ObjectPath(field);
                Op
                    .Add(new Json0Op {
                        Path = CreateJson0Path(objectPath.Items),
                        DeleteProp = oldValue,
                        InsertProp = newValue
                    });
            }
            return this;
        }

        public Json0OpBuilder<T> Unset<TField>(Expression<Func<T, TField>> field)
        {
            var objectPath = new ObjectPath(field);
            if (objectPath.TryGetValue<T, TField>(_data, out TField value) && value != null)
                Op.Add(new Json0Op { Path = CreateJson0Path(objectPath.Items), DeleteProp = value });
            return this;
        }

        public Json0OpBuilder<T> Unset<TField>(Expression<Func<T, TField>> field, TField value)
        {
            var objectPath = new ObjectPath(field);
            Op.Add(new Json0Op { Path = CreateJson0Path(objectPath.Items), DeleteProp = value });
            return this;
        }

        public Json0OpBuilder<T> Inc(Expression<Func<T, int>> field, int n = 1)
        {
            var objectPath = new ObjectPath(field);
            Op.Add(new Json0Op { Path = CreateJson0Path(objectPath.Items), Add = n });
            return this;
        }

        private static List<object> CreateJson0Path(IEnumerable<object> path)
        {
            return path.Select(i => (i is string str) ? str.ToCamelCase() : i).ToList();
        }
    }
}
