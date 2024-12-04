using System.Collections.Generic;

namespace SIL.XForge.Models;

public class User : ProjectMember
{
    public string Name { get; set; }
    public string Email { get; set; }
    public List<string> Roles { get; set; } = new List<string>();
    public string AvatarUrl { get; set; }

    /// <summary>PT user id, as determined from auth0 profile, from authenticating with Paratext.</summary>
    public string ParatextId { get; set; }
    public string DisplayName { get; set; }
    public bool IsDisplayNameConfirmed { get; set; }
    public string InterfaceLanguage { get; set; }

    /// <summary>
    /// The id of the user as understood by auth0.
    /// This is the user_id string received from auth0 when the user first logged in. It is not indicative of what
    /// authentication method the user is currently using. So it might be `auth0|abc1234` even if the user
    /// is authenticating with Paratext.
    /// </summary>
    public string AuthId { get; set; }
    public Dictionary<string, Site> Sites { get; set; } = new Dictionary<string, Site>();
    public HashSet<string> ViewedNotifications { get; set; } = new();
}
