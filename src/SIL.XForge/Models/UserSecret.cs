using System.Collections.Generic;

namespace SIL.XForge.Models;

/// <summary>
/// This model is used to store user data that we don't want to leak to the front-end. This is stored in a separate
/// collection.
/// </summary>
public class UserSecret : IIdentifiable
{
    // Stores a mapping of usernames to the forced usernames for a user secret to allow specifying an
    // alternate username. This is needed to persist data created by a user prior changing PT names
    private static Dictionary<string, string> _forcedUsernameMap = [];

    /// <summary>
    /// SF user ID of the user that these secrets pertain to. (This is not a different set of IDs for
    /// specifically user secrets.)
    /// </summary>
    public string Id { get; set; }

    public Tokens ParatextTokens { get; set; }

    public static string ParatextUsername(string username)
    {
        if (_forcedUsernameMap.TryGetValue(username, out string forcedUsername))
            return forcedUsername;
        return username;
    }

    public static void RemoveForcedUsernames() => _forcedUsernameMap.Clear();

    public static bool ForceUsername(string username, string forcedUsername) =>
        _forcedUsernameMap.TryAdd(username, forcedUsername);
}
