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
            byte[] data = new byte[12];  // 12 bytes of data become 16 bytes of base-64 text
            using (var crypto = RandomNumberGenerator.Create())
            {
                crypto.GetBytes(data);
            }
            return WebEncoders.Base64UrlEncode(data);
        }
    }
}
