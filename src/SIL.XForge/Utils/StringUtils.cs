using MongoDB.Bson;
using Newtonsoft.Json.Serialization;
using System.Security.Cryptography;
using System.Text;

namespace SIL.XForge.Utils
{
    public static class StringUtils
    {
        private static readonly CamelCaseNamingStrategy CamelCaseNamingStrategy = new CamelCaseNamingStrategy();

        public static string ComputeMd5Hash(string message)
        {
            using (MD5 md5 = MD5.Create())
            {
                byte[] input = Encoding.ASCII.GetBytes(message);
                byte[] hash = md5.ComputeHash(input);

                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < hash.Length; i++)
                {
                    sb.Append(hash[i].ToString("X2"));
                }
                return sb.ToString().ToLower();
            }
        }

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
