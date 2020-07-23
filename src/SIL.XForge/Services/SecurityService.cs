using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;

namespace SIL.XForge.Services
{
    /// <summary>Security related utilities</summary>
    public class SecurityService : ISecurityService
    {
        /// <summary>Return a random 16-character base-64 string that is safe to use in URLs.</summary>
        public string GenerateKey()
        {
            System.Span<byte> data = stackalloc byte[12];  // 12 bytes of data become 16 bytes of base-64 text
            RandomNumberGenerator.Fill(data);
            return WebEncoders.Base64UrlEncode(data);
        }
    }
}
