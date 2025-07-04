using System;
using System.Security.Cryptography;
using System.Text;
using MongoDB.Bson;
using Newtonsoft.Json.Serialization;

namespace SIL.XForge.Utils;

public static class StringUtils
{
    private static readonly CamelCaseNamingStrategy CamelCaseNamingStrategy = new CamelCaseNamingStrategy();

    public static string ComputeMd5Hash(string message)
    {
        byte[] inputBytes = Encoding.UTF8.GetBytes(message);
        byte[] hashBytes = MD5.HashData(inputBytes);
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }

    /// <summary>
    /// Sanitizes a string for logging.
    /// </summary>
    /// <param name="value">The string value.</param>
    /// <returns>The string sanitized for logging.</returns>
    /// <remarks>This extension method resolves CodeQL <c>cs/log-forging</c>.</remarks>
    public static string Sanitize(this string value) => value.ReplaceLineEndings(string.Empty);

    public static string ToCamelCase(this string str) => CamelCaseNamingStrategy.GetPropertyName(str, false);

    public static bool ValidateId(string id) => ObjectId.TryParse(id, out _);
}
