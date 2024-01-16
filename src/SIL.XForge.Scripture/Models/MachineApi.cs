using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Machine API URL strings and helper methods.
/// </summary>
public static class MachineApi
{
    public const string HttpClientName = "machine_api";
    public const string Namespace = "machine-api/v3";
    public const string StartBuild = "translation/builds";
    public const string GetBuild = "translation/builds/id:{sfProjectId}.{buildId?}";
    public const string GetEngine = "translation/engines/project:{sfProjectId}";
    public const string GetWordGraph = "translation/engines/project:{sfProjectId}/actions/getWordGraph";
    public const string TrainSegment = "translation/engines/project:{sfProjectId}/actions/trainSegment";
    public const string Translate = "translation/engines/project:{sfProjectId}/actions/translate";
    public const string TranslateN = "translation/engines/project:{sfProjectId}/actions/translate/{n}";
    public const string StartPreTranslationBuild = "translation/pretranslations";
    public const string CancelPreTranslationBuild = "translation/pretranslations/cancel";
    public const string GetPreTranslation =
        "translation/engines/project:{sfProjectId}/actions/preTranslate/{bookNum}_{chapterNum}";
    public const string GetLastCompletedPreTranslationBuild =
        "translation/engines/project:{sfProjectId}/actions/getLastCompletedPreTranslationBuild";

    /// <summary>
    /// Ensures that a user has permission to perform actions to the Serval/Machine API.
    /// </summary>
    /// <param name="userId">The user id.</param>
    /// <param name="project">The project.</param>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to access the Serval/Machine API.
    /// </exception>
    public static void EnsureProjectPermission(string userId, Project project)
    {
        // Check for permission
        if (!HasPermission(userId, project))
        {
            throw new ForbiddenException();
        }
    }

    public static string GetBuildHref(string sfProjectId, string buildId)
    {
        // The {locatorType} parameter is required to maintain compatibility with the v1 machine-api and machine.js
        string buildHref = GetBuild.Replace("{sfProjectId}", sfProjectId).Replace("{buildId?}", buildId);
        return $"{Namespace}/{buildHref}";
    }

    public static string GetEngineHref(string sfProjectId) =>
        $"{Namespace}/{GetEngine.Replace("{sfProjectId}", sfProjectId)}";

    /// <summary>
    /// Determines if a user has permission to perform actions to the Serval/Machine API.
    /// </summary>
    /// <param name="userId">The user id.</param>
    /// <param name="project">The project.</param>
    /// <returns><c>true</c> if the user has permission; otherwise, <c>false</c>.</returns>
    public static bool HasPermission(string? userId, Project project) =>
        !string.IsNullOrWhiteSpace(userId)
        && project.UserRoles.TryGetValue(userId, out string role)
        && role is SFProjectRole.Administrator or SFProjectRole.Translator;
}
