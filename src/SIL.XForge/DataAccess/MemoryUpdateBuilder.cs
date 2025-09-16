using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.DataAccess;

public class MemoryUpdateBuilder<T>(T entity, bool isInsert) : IUpdateBuilder<T>
    where T : IIdentifiable
{
    public IUpdateBuilder<T> Set<TField>(Expression<Func<T, TField>> field, TField value)
    {
        (IEnumerable<object> owners, PropertyInfo propInfo, object index) = GetFieldOwners(field);
        object[] indices = index == null ? null : [index];
        foreach (object owner in owners)
            propInfo.SetValue(owner, value, indices);
        return this;
    }

    public IUpdateBuilder<T> SetOnInsert<TField>(Expression<Func<T, TField>> field, TField value)
    {
        if (isInsert)
            Set(field, value);
        return this;
    }

    public IUpdateBuilder<T> Unset<TField>(Expression<Func<T, TField>> field)
    {
        (IEnumerable<object> owners, PropertyInfo prop, object index) = GetFieldOwners(field);
        if (index != null)
        {
            // remove value from a dictionary
            Type dictionaryType = prop.DeclaringType;
            Type keyType = dictionaryType!.GetGenericArguments()[0];
            MethodInfo removeMethod = dictionaryType.GetMethod("Remove", [keyType]);
            foreach (object owner in owners)
                removeMethod?.Invoke(owner, [index]);
        }
        else
        {
            // set property to default value
            object value = null;
            if (prop.PropertyType.IsValueType)
                value = Activator.CreateInstance(prop.PropertyType);
            foreach (object owner in owners)
                prop.SetValue(owner, value);
        }
        return this;
    }

    public IUpdateBuilder<T> Inc(Expression<Func<T, int>> field, int value)
    {
        (IEnumerable<object> owners, PropertyInfo prop, object index) = GetFieldOwners(field);
        object[] indices = index == null ? null : [index];
        foreach (object owner in owners)
        {
            int curValue = prop.GetValue(owner, indices) as int? ?? 0;
            curValue += value;
            prop.SetValue(owner, curValue, indices);
        }
        return this;
    }

    public IUpdateBuilder<T> RemoveAll<TItem>(
        Expression<Func<T, IEnumerable<TItem>>> field,
        Expression<Func<TItem, bool>> predicate
    )
    {
        Func<T, IEnumerable<TItem>> getCollection = field.Compile();
        IEnumerable<TItem> collection = getCollection(entity);
        TItem[] toRemove = [.. collection.Where(predicate.Compile())];
        MethodInfo removeMethod = collection.GetType().GetMethod("Remove");
        foreach (TItem item in toRemove)
            removeMethod?.Invoke(collection, [item]);
        return this;
    }

    public IUpdateBuilder<T> Remove<TItem>(Expression<Func<T, IEnumerable<TItem>>> field, TItem value)
    {
        Func<T, IEnumerable<TItem>> getCollection = field.Compile();
        IEnumerable<TItem> collection = getCollection(entity);
        MethodInfo addMethod = collection.GetType().GetMethod("Remove");
        addMethod?.Invoke(collection, [value]);
        return this;
    }

    public IUpdateBuilder<T> Add<TItem>(Expression<Func<T, IEnumerable<TItem>>> field, TItem value)
    {
        Func<T, IEnumerable<TItem>> getCollection = field.Compile();
        IEnumerable<TItem> collection = getCollection(entity);
        MethodInfo addMethod = collection.GetType().GetMethod("Add");
        addMethod?.Invoke(collection, [value]);
        return this;
    }

    private (IEnumerable<object> Owners, PropertyInfo Property, object Index) GetFieldOwners<TField>(
        Expression<Func<T, TField>> field
    )
    {
        List<object> owners = null;
        MemberInfo member = null;
        object index = null;
        foreach (Expression node in ExpressionHelper.Flatten(field))
        {
            var newOwners = new List<object>();
            if (owners == null)
            {
                if (entity != null)
                    newOwners.Add(entity);
            }
            else
            {
                foreach (object owner in owners)
                {
                    object newOwner;
                    switch (member)
                    {
                        case MethodInfo method:
                            newOwner = method.Invoke(owner, [index]);
                            if (newOwner != null)
                                newOwners.Add(newOwner);
                            break;

                        case PropertyInfo prop:
                            newOwner = prop.GetValue(owner);
                            if (newOwner != null)
                                newOwners.Add(newOwner);
                            break;
                    }
                }
            }
            owners = newOwners;

            switch (node)
            {
                case MemberExpression memberExpr:
                    member = memberExpr.Member;
                    index = null;
                    break;

                case MethodCallExpression methodExpr:
                    member = methodExpr.Method;
                    if (member.Name != "get_Item")
                        throw new ArgumentException("Invalid method call in field expression.", nameof(field));

                    Expression argExpr = methodExpr.Arguments[0];
                    index = ExpressionHelper.FindConstantValue(argExpr);
                    break;
            }
        }

        PropertyInfo property = member as PropertyInfo;
        if (property == null && member != null && index != null)
            property = member.DeclaringType.GetProperty("Item");
        return (owners, property, index);
    }
}
