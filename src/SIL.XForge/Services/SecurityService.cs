using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;

namespace SIL.XForge.Services;

/// <summary>Security related utilities</summary>
public class SecurityService : ISecurityService
{
    /// <summary>Return a random 16-character base-64 string that is safe to use in URLs.</summary>
    /// <param name="length">Length of bytes to generate the key from</param>
    /// <remarks>
    /// For example, 12 bytes of data will become 16 bytes of base-64 text
    /// </remarks>
    public string GenerateKey(int length = 12)
    {
        System.Span<byte> data = length <= 128 ? stackalloc byte[length] : new byte[length];
        RandomNumberGenerator.Fill(data);
        return WebEncoders.Base64UrlEncode(data);
    }
}
