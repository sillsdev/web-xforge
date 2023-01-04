namespace SIL.XForge.Scripture.Models;

public static class SFProjectRole
{
    public const string Administrator = "pt_administrator";
    public const string Translator = "pt_translator";
    public const string Consultant = "pt_consultant";
    public const string PTObserver = "pt_observer";
    public const string Read = "pt_read";
    public const string WriteNote = "pt_write_note";
    public const string Reviewer = "sf_reviewer";
    public const string CommunityChecker = "sf_community_checker";
    public const string SFObserver = "sf_observer";

    public static bool IsParatextRole(string role) =>
        role switch
        {
            SFProjectRole.Administrator
            or SFProjectRole.Translator
            or SFProjectRole.Consultant
            or SFProjectRole.PTObserver
                => true,
            _ => false,
        };
}
