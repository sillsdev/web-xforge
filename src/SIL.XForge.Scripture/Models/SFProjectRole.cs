namespace SIL.XForge.Scripture.Models;

public static class SFProjectRole
{
    public const string Administrator = "pt_administrator";
    public const string Translator = "pt_translator";
    public const string Consultant = "pt_consultant";
    public const string PTObserver = "pt_observer";
    public const string Commenter = "sf_commenter";
    public const string CommunityChecker = "sf_community_checker";
    public const string Viewer = "sf_observer";

    public static bool IsParatextRole(string role) =>
        role switch
        {
            Administrator or Translator or Consultant or PTObserver => true,
            _ => false,
        };
}
