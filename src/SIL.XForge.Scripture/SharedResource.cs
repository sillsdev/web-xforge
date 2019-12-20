using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture
{
    /// <summary>
    /// This class holds the Keys for looking up localizable strings in the IStringLocalizer.
    /// It also provides the class which IStringLocalizer uses to find the .resx files with the strings
    /// Every string in the Keys class here should also be present in the Resources\SharedResource.en.resx
    /// with the english translation as the value.
    /// </summary>
    public class SharedResource
    {
        public static class Keys
        {
            public const string UserMissing = "UserMissing";
            public const string InviteSubject = "InviteSubject";
            public const string InviteGreeting = "InviteGreeting";
            public const string InviteInstructions = "InviteInstructions";
            public const string InvitePTOption = "InvitePTOption";
            public const string InviteGoogleOption = "InviteGoogleOption";
            public const string InviteEmailOption = "InviteEmailOption";
            public const string InviteSignature = "InviteSignature";
            public const string InviteLinkSharingOn = "InviteLinkSharingOn";
            public const string InviteLinkSharingOff = "InviteLinkSharingOff";
            public const string NameMissing = "NameMissing";
            public const string EmailMissing = "EmailMissing";
            public const string EmailBad = "EmailBad";
            public const string RoleMissing = "RoleMissing";
            public const string MessageMissing = "MessageMissing";
            public const string Terms = "Terms";
            public const string Privacy = "Privacy";
        }

        /// <summary>
        /// Map of culture identifier (language tag) to interface language object (local name displayed in the chooser)
        /// </summary>
        public static Dictionary<string, InterfaceLanguage> Cultures = new Dictionary<string, InterfaceLanguage>
        {
            { "en", new InterfaceLanguage
                {
                    LocalName = "English (US)",
                    EnglishName = "English (US)",
                    CanonicalTag = "en",
                    Tags = new string[]{ "en", "en-US" },
                    Production = true
                }
            },
            { "en-GB", new InterfaceLanguage
                {
                    LocalName = "English (UK)",
                    EnglishName = "English (UK)",
                    CanonicalTag = "en-GB",
                    Tags = new string[]{ "en-GB" },
                    Production = true
                }
            },
            { "es", new InterfaceLanguage
                {
                    LocalName = "Español",
                    EnglishName = "Spanish",
                    CanonicalTag = "es",
                    Tags = new string[]{ "es", "es-ES" },
                    Production = false
                }
            },
            { "zh-CN", new InterfaceLanguage
                {
                    LocalName = "简体中文",
                    EnglishName = "Chinese (Simplified)",
                    Direction = "ltr",
                    Tags = new string[]{ "zh-CN", "zh" },
                    Production = false
                }
            },
            { "az", new InterfaceLanguage
                {
                    LocalName = "Azərbaycanca",
                    EnglishName = "Azerbaijani",
                    CanonicalTag = "az",
                    Tags = new string[]{ "az", "az-AZ" },
                    Production = false
                }
            }
        };
    }
}
