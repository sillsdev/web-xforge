using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using IdentityModel;

namespace SIL.XForge.Models
{
    public class UserEntity : Entity
    {
        public enum ContactMethods
        {
            email,
            emailSms,
            sms
        }

        public static string CanonicalizeEmail(string email)
        {
            return email?.Trim().ToLowerInvariant();
        }

        public static string HashEmail(string email)
        {
            string hashEmail;
            using (MD5 md5Hash = MD5.Create())
            {
                // Convert the email string to a byte array and compute the hash
                byte[] data = md5Hash.ComputeHash(Encoding.UTF8.GetBytes(UserEntity.CanonicalizeEmail(email)));
                StringBuilder sb = new StringBuilder();
                // Loop through each byte of the hashed data and format each one as a hexadecimal string
                for (int i = 0; i < data.Length; i++)
                {
                    sb.Append(data[i].ToString("x2"));
                }
                hashEmail = sb.ToString();
            }
            return hashEmail;
        }

        public static string NormalizeUsername(string username)
        {
            return username?.ToLowerInvariant();
        }

        public static string HashPassword(string password)
        {
            return BCrypt.Net.BCrypt.HashPassword((string)password, 7);
        }

        public string Username { get; set; }
        public string Name { get; set; }
        public string Email { get; set; }
        public string CanonicalEmail { get; set; }
        public string EmailMd5 { get; set; }
        public bool EmailVerified { get; set; }
        public string ValidationKey { get; set; }
        public DateTime ValidationExpirationDate { get; set; }
        public string ResetPasswordKey { get; set; }
        public DateTime ResetPasswordExpirationDate { get; set; }
        public string Role { get; set; }
        public bool Active { get; set; }
        public string AvatarUrl { get; set; }
        public string GoogleId { get; set; }
        public string Password { get; set; }
        public string ParatextId { get; set; }
        public Tokens ParatextTokens { get; set; }
        public string MobilePhone { get; set; }
        public ContactMethods ContactMethod { get; set; }
        public DateTime Birthday { get; set; }
        public string Gender { get; set; }
        public Dictionary<string, Site> Sites { get; set; } = new Dictionary<string, Site>();

        public Dictionary<string, object> ExtraElements { get; protected set; }

        public IEnumerable<Claim> GetClaims()
        {
            var claims = new List<Claim>
            {
                new Claim(JwtClaimTypes.Subject, Id),
                new Claim(JwtClaimTypes.Name, Name),
                new Claim(JwtClaimTypes.Role, Role),
                new Claim(JwtClaimTypes.Email, Email)
            };
            if (Username != null)
                claims.Add(new Claim(JwtClaimTypes.PreferredUserName, Username));
            return claims;
        }

        public bool VerifyPassword(string password)
        {
            if (string.IsNullOrEmpty(Password))
                return false;

            return BCrypt.Net.BCrypt.Verify(password, Password);
        }

        public bool VerifyEmailMd5(string emailMd5)
        {
            bool verified = false;
            using (MD5 md5Hash = MD5.Create())
            {
                StringComparer sc = StringComparer.OrdinalIgnoreCase;
                if (sc.Compare(emailMd5, EmailMd5) == 0)
                    verified = true;
            }
            return verified;
        }
    }
}
