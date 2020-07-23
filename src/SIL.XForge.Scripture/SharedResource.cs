using System.Collections.Generic;
using SIL.XForge.Models;
using System.IO;
using Newtonsoft.Json;

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
            public const string EmailBad = "EmailBad";
            public const string EmailMissing = "EmailMissing";
            public const string InviteEmailOption = "InviteEmailOption";
            public const string InviteFacebookOption = "InviteFacebookOption";
            public const string InviteGoogleOption = "InviteGoogleOption";
            public const string InviteGreeting = "InviteGreeting";
            public const string InviteInstructions = "InviteInstructions";
            public const string InviteLinkSharingOff = "InviteLinkSharingOff";
            public const string InviteLinkSharingOn = "InviteLinkSharingOn";
            public const string InvitePTOption = "InvitePTOption";
            public const string InviteSignature = "InviteSignature";
            public const string InviteSubject = "InviteSubject";
            public const string Language = "Language";
            public const string LearnMore = "LearnMore";
            public const string LogIn = "LogIn";
            public const string MessageMissing = "MessageMissing";
            public const string NameMissing = "NameMissing";
            public const string Privacy = "Privacy";
            public const string RoleMissing = "RoleMissing";
            public const string SignUp = "SignUp";
            public const string Terms = "Terms";
            public const string UserMissing = "UserMissing";
        }

        /// <summary>
        /// Map of culture identifier (language tag) to interface language object (local name displayed in the chooser)
        /// </summary>
        public static Dictionary<string, InterfaceLanguage> Cultures = SharedResource.getCultures();

        static Dictionary<string, InterfaceLanguage> getCultures()
        {
            // TODO consider making file path relative to current file rather than CWD
            var cultureData = JsonConvert.DeserializeObject<List<InterfaceLanguage>>(File.ReadAllText("locales.json"));
            var cultures = new Dictionary<string, InterfaceLanguage> { };
            foreach (var culture in cultureData)
            {
                cultures.Add(culture.CanonicalTag, culture);
            }
            return cultures;
        }
    }
}
