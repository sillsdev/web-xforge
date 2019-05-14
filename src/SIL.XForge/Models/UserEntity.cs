using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

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

        public string Name { get; set; }
        public string Email { get; set; }
        public string CanonicalEmail { get; set; }
        public string EmailMd5 { get; set; }
        public bool Active { get; set; }
        public string AvatarUrl { get; set; }
        public string GoogleId { get; set; }
        public string ParatextId { get; set; }
        public Tokens ParatextTokens { get; set; }
        public string MobilePhone { get; set; }
        public ContactMethods ContactMethod { get; set; }
        public DateTime Birthday { get; set; }
        public string Gender { get; set; }
        public string AuthId { get; set; }
        public Dictionary<string, Site> Sites { get; set; } = new Dictionary<string, Site>();

        public Dictionary<string, object> ExtraElements { get; protected set; }

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
