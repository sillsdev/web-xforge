using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;

namespace SIL.XForge.Services;

/// <summary>Security related utilities</summary>
public class SecurityService : ISecurityService
{
    /// <summary>Return a random 16-character base-64 string that is safe to use in URLs.</summary>
    /// <param name="bytes">Bytes of data to generate the key from
    /// <remarks>
    /// For example, 12 bytes of data will become 16 bytes of base-64 text
    /// </remarks>
    public string GenerateKey(int bytes = 12)
    {
        System.Span<byte> data = stackalloc byte[bytes];
        RandomNumberGenerator.Fill(data);
        return WebEncoders.Base64UrlEncode(data);
    }
}
