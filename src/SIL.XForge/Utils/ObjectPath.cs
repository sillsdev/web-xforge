using System;
using System.Collections.Generic;
using System.Linq.Expressions;

namespace SIL.XForge.Utils
{
    public class ObjectPath
    {
        public static ObjectPath Create<TObj, TField>(Expression<Func<TObj, TField>> field)
        {
            return new ObjectPath(field);
        }

        public ObjectPath(LambdaExpression expression)
        {
            Expression = expression;
            Items = ParsePath(expression);
        }

        public LambdaExpression Expression { get; }

        public IReadOnlyList<object> Items { get; }

        public bool TryGetValue<TObj, TField>(TObj obj, out TField value)
        {
            var getter = (Func<TObj, TField>)Expression.Compile();
            try
            {
                value = getter(obj);
                return true;
            }
            catch (Exception)
            {
                value = default(TField);
                return false;
            }
        }

        private static IReadOnlyList<object> ParsePath(LambdaExpression expression)
        {
            var path = new List<object>();
            foreach (Expression node in ExpressionHelper.Flatten(expression))
            {
                switch (node)
                {
                    case MemberExpression memberExpr:
                        path.Add(memberExpr.Member.Name);
                        break;

                    case MethodCallExpression methodExpr:
                        if (methodExpr.Method.Name != "get_Item")
                            throw new ArgumentException("Invalid method call in field expression.", nameof(expression));

                        Expression argExpr = methodExpr.Arguments[0];
                        path.Add(ExpressionHelper.FindConstantValue(argExpr));
                        break;
                }
            }
            return path;
        }
    }
}
