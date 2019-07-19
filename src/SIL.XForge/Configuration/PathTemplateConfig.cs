using System;
using System.Linq.Expressions;
using SIL.XForge.Utils;

namespace SIL.XForge.Configuration
{
    public static class PathTemplateConfig<T>
    {
        public static PathTemplateConfig Create<TField>(Expression<Func<T, TField>> field, bool inherit = true)
        {
            return new PathTemplateConfig(new ObjectPath(field), inherit);
        }
    }

    public class PathTemplateConfig
    {
        public PathTemplateConfig(ObjectPath template, bool inherit = true)
        {
            Template = template;
            Inherit = inherit;
        }

        public ObjectPath Template { get; }
        public bool Inherit { get; }
    }
}
