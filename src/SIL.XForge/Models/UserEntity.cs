using System;
using System.Collections.Generic;

namespace SIL.XForge.Models
{
    public static class ContactMethod
    {
        public const string Email = "email";
        public const string EmailSms = "emailSms";
        public const string Sms = "sms";
    }

    public class UserEntity : Entity
    {
        public string Name { get; set; }
        public string Email { get; set; }
        public string Role { get; set; }
        public bool Active { get; set; }
        public string AvatarUrl { get; set; }
        public string ParatextId { get; set; }
        public Tokens ParatextTokens { get; set; }
        public string MobilePhone { get; set; }
        public string ContactMethod { get; set; }
        public DateTime Birthday { get; set; }
        public string Gender { get; set; }
        public string AuthId { get; set; }
        public Dictionary<string, Site> Sites { get; set; } = new Dictionary<string, Site>();

        public Dictionary<string, object> ExtraElements { get; set; }
    }
}
