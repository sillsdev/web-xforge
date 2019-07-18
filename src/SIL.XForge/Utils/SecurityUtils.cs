using System.Security.Cryptography;
using System.Text;

namespace SIL.XForge.Utils
{
    /// <summary>Security related utilities</summary>
    public class SecurityUtils : ISecurityUtils
    {
        /// <summary>Return a random 16-character base-36 string.</summary>
        public string GenerateKey()
        {
            char[] chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890".ToCharArray();
            byte[] data = new byte[1];
            using (var crypto = new RNGCryptoServiceProvider())
            {
                crypto.GetNonZeroBytes(data);
                data = new byte[16];
                crypto.GetNonZeroBytes(data);
            }
            var key = new StringBuilder(16);
            foreach (byte b in data)
            {
                key.Append(chars[b % (chars.Length)]);
            }
            return key.ToString();
        }
    }
}
