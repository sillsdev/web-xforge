using System;
using System.Security.Cryptography;
using System.Text;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>Description of a project on the Paratext server.</summary>
    public class ParatextProject
    {
        /// <summary>Id of PT project on Paratext servers.</summary>
        public string ParatextId { get; set; }
        public string Name { get; set; }
        public string ShortName { get; set; }
        public string LanguageTag { get; set; }
        /// <summary>Id of corresponding SF project.</summary>
        public string SFProjectId { get; set; }
        /// <summary>If the requesting user has access to the PT project, but not yet to a corresponding SF project, and has permission to connect a SF project to the PT project. The SF project may or may not yet already exist.</summary>
        public bool IsConnectable { get; set; }
        /// <summary>If the requesting user has access to both the PT project and the corresponding SF project.</summary>
        public bool IsConnected { get; set; }

        /// <summary>Hash of properties.</summary>
        public string GetHash()
        {
            using (var sha = SHA512.Create())
            {
                return Convert.ToBase64String(sha.ComputeHash(Encoding.UTF8.GetBytes(ExpressiveToString())));
            }
        }

        /// <summary>Descriptive string of object's properties, for debugging.</summary>
        internal string ExpressiveToString()
        {
            StringBuilder message = new StringBuilder();
            foreach (string item in new string[] { ParatextId, Name, ShortName, LanguageTag, SFProjectId, IsConnectable.ToString(), IsConnected.ToString() })
            {
                message.Append(item);
                message.Append(',');
            }
            return message.ToString();
        }


    }
}
