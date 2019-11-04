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
            public static string UserMissing = "UserMissing";
            public static string InviteSubject = "InviteSubject";
            public static string InviteGreeting = "InviteGreeting";
            public static string InviteInstructions = "InviteInstructions";
            public static string InvitePTOption = "InvitePTOption";
            public static string InviteGoogleOption = "InviteGoogleOption";
            public static string InviteEmailOption = "InviteEmailOption";
            public static string InviteSignature = "InviteSignature";
            public static string InviteLinkSharingOn = "InviteLinkSharingOn";
            public static string InviteLinkSharingOff = "InviteLinkSharingOff";
        }
    }
}
