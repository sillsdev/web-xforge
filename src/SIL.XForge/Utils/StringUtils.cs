using MongoDB.Bson;
using Newtonsoft.Json.Serialization;

namespace SIL.XForge.Utils
{
    public static class StringUtils
    {
        private static readonly CamelCaseNamingStrategy CamelCaseNamingStrategy = new CamelCaseNamingStrategy();

        public static string ToCamelCase(this string str)
        {
            return CamelCaseNamingStrategy.GetPropertyName(str, false);
        }

        public static bool ValidateId(string id)
        {
            return ObjectId.TryParse(id, out _);
        }
    }
}
