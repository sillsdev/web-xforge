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
            public const string NameBadChars = "NameBadChars";
            public const string EmailMissing = "EmailMissing";
            public const string EmailBad = "EmailBad";
            public const string RoleMissing = "RoleMissing";
            public const string MessageMissing = "MessageMissing";

        }
    }
}
