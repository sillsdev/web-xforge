using System.Linq.Expressions;
using System.Collections.Generic;
using System.Linq;
using SIL.XForge.Utils;
using System;
using System.Reflection;

namespace SIL.XForge.Realtime.Json0
{
    public class Json0OpBuilder<T>
    {
        private readonly T _data;

        public Json0OpBuilder(T data)
        {
            _data = data;
        }

        public List<Json0Op> Op { get; } = new List<Json0Op>();

        public Json0OpBuilder<T> Insert<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem item)
        {
            (_, _, List<object> path) = GetFieldInfo(field);
            path.Add(index);
            Op.Add(new Json0Op { Path = CreatePath(path), InsertItem = item });
            return this;
        }

        public Json0OpBuilder<T> Add<TItem>(Expression<Func<T, List<TItem>>> field, TItem item)
        {
            (object owner, PropertyInfo propInfo, List<object> path) = GetFieldInfo(field);
            var list = (List<TItem>)propInfo.GetValue(owner);
            path.Add(list.Count);
            Op.Add(new Json0Op { Path = CreatePath(path), InsertItem = item });
            return this;
        }

        public Json0OpBuilder<T> Remove<TItem>(Expression<Func<T, List<TItem>>> field, int index)
        {
            (object owner, PropertyInfo propInfo, List<object> path) = GetFieldInfo(field);
            var list = (List<TItem>)propInfo.GetValue(owner);
            path.Add(index);
            Op.Add(new Json0Op { Path = CreatePath(path), DeleteItem = list[index] });
            return this;
        }

        public Json0OpBuilder<T> Remove<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem item)
        {
            (_, _, List<object> path) = GetFieldInfo(field);
            path.Add(index);
            Op.Add(new Json0Op { Path = CreatePath(path), DeleteItem = item });
            return this;
        }

        public Json0OpBuilder<T> Replace<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem newItem)
        {
            return Replace(field, index, newItem, EqualityComparer<TItem>.Default);
        }

        public Json0OpBuilder<T> Replace<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem newItem,
            IEqualityComparer<TItem> equalityComparer)
        {
            (object owner, PropertyInfo propInfo, List<object> path) = GetFieldInfo(field);
            var list = (List<TItem>)propInfo.GetValue(owner);
            TItem oldItem = list[index];
            if (!equalityComparer.Equals(oldItem, newItem))
            {
                path.Add(index);
                Op.Add(new Json0Op { Path = CreatePath(path), DeleteItem = oldItem, InsertItem = newItem });
            }
            return this;
        }

        public Json0OpBuilder<T> Replace<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem newItem,
            TItem oldItem)
        {
            return Replace(field, index, newItem, oldItem, EqualityComparer<TItem>.Default);
        }

        public Json0OpBuilder<T> Replace<TItem>(Expression<Func<T, List<TItem>>> field, int index, TItem newItem,
            TItem oldItem, IEqualityComparer<TItem> equalityComparer)
        {
            if (!equalityComparer.Equals(oldItem, newItem))
            {
                (_, _, List<object> path) = GetFieldInfo(field);
                path.Add(index);
                Op.Add(new Json0Op { Path = CreatePath(path), DeleteItem = oldItem, InsertItem = newItem });
            }
            return this;
        }

        public Json0OpBuilder<T> Set<TField>(Expression<Func<T, TField>> field, TField value)
        {
            return Set(field, value, EqualityComparer<TField>.Default);
        }

        public Json0OpBuilder<T> Set<TField>(Expression<Func<T, TField>> field, TField value,
            IEqualityComparer<TField> equalityComparer)
        {
            (object owner, PropertyInfo propInfo, List<object> path) = GetFieldInfo(field);
            var oldValue = (TField)propInfo.GetValue(owner);
            if (!equalityComparer.Equals(value, oldValue))
                Op.Add(new Json0Op { Path = CreatePath(path), DeleteProp = oldValue, InsertProp = value });
            return this;
        }

        public Json0OpBuilder<T> Set<TField>(Expression<Func<T, TField>> field, TField newValue,
            TField oldValue)
        {
            return Set(field, newValue, oldValue, EqualityComparer<TField>.Default);
        }

        public Json0OpBuilder<T> Set<TField>(Expression<Func<T, TField>> field, TField newValue,
            TField oldValue, IEqualityComparer<TField> equalityComparer)
        {
            if (!equalityComparer.Equals(newValue, oldValue))
            {
                (_, _, List<object> path) = GetFieldInfo(field);
                Op.Add(new Json0Op { Path = CreatePath(path), DeleteProp = oldValue, InsertProp = newValue });
            }
            return this;
        }

        public Json0OpBuilder<T> Unset<TField>(Expression<Func<T, TField>> field)
        {
            (object owner, PropertyInfo propInfo, List<object> path) = GetFieldInfo(field);
            object value = propInfo.GetValue(owner);
            Op.Add(new Json0Op { Path = CreatePath(path), DeleteProp = value });
            return this;
        }

        public Json0OpBuilder<T> Unset<TField>(Expression<Func<T, TField>> field, TField value)
        {
            (_, _, List<object> path) = GetFieldInfo(field);
            Op.Add(new Json0Op { Path = CreatePath(path), DeleteProp = value });
            return this;
        }

        public Json0OpBuilder<T> Inc(Expression<Func<T, int>> field, int n = 1)
        {
            (_, _, List<object> path) = GetFieldInfo(field);
            Op.Add(new Json0Op { Path = CreatePath(path), Add = n });
            return this;
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

        private (object Owner, PropertyInfo Property, List<object> Path) GetFieldInfo<TField>(
            Expression<Func<T, TField>> field)
        {
            var path = new List<object>();
            object owner = null;
            MemberInfo member = null;
            object index = null;
            foreach (Expression node in ExpressionHelper.Flatten(field))
            {
                object newOwner = null;
                if (owner == null)
                {
                    if (_data != null)
                        newOwner = _data;
                }
                else
                {
                    switch (member)
                    {
                        case MethodInfo method:
                            newOwner = method.Invoke(owner, new object[] { index });
                            break;

                        case PropertyInfo prop:
                            newOwner = prop.GetValue(owner);
                            break;
                    }
                }
                owner = newOwner;

                switch (node)
                {
                    case MemberExpression memberExpr:
                        member = memberExpr.Member;
                        path.Add(member.Name);
                        index = null;
                        break;

                    case MethodCallExpression methodExpr:
                        member = methodExpr.Method;
                        if (member.Name != "get_Item")
                            throw new ArgumentException("Invalid method call in field expression.", nameof(field));

                        Expression argExpr = methodExpr.Arguments[0];
                        index = ExpressionHelper.FindConstantValue(argExpr);
                        path.Add(index);
                        break;
                }
            }

            PropertyInfo property = member as PropertyInfo;
            if (property == null && index != null)
                property = member.DeclaringType.GetProperty("Item");
            return (owner, property, path);
        }
    }
}
