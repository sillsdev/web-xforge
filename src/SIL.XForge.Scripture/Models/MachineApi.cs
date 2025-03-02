using System.Linq;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// Machine API URL strings and helper methods.
/// </summary>
public static class MachineApi
{
    public const string HttpClientName = "machine_api";
    public const string TokenClientName = "machine_api_token";
    public const string Namespace = "machine-api/v3";
    public const string StartBuild = "translation/builds";
    public const string GetBuild = "translation/builds/id:{sfProjectId}.{buildId?}";
    public const string GetEngine = "translation/engines/project:{sfProjectId}";
    public const string GetWordGraph = "translation/engines/project:{sfProjectId}/actions/getWordGraph";
    public const string IsLanguageSupported = "translation/languages/{languageCode}";
    public const string TrainSegment = "translation/engines/project:{sfProjectId}/actions/trainSegment";
    public const string Translate = "translation/engines/project:{sfProjectId}/actions/translate";
    public const string TranslateN = "translation/engines/project:{sfProjectId}/actions/translate/{n}";
    public const string StartPreTranslationBuild = "translation/pretranslations";
    public const string CancelPreTranslationBuild = "translation/pretranslations/cancel";
    public const string GetPreTranslation =
        "translation/engines/project:{sfProjectId}/actions/preTranslate/{bookNum}_{chapterNum}";
    public const string GetPreTranslationDelta =
        "translation/engines/project:{sfProjectId}/actions/preTranslate/{bookNum}_{chapterNum}/delta";
    public const string GetPreTranslationHistory =
        "translation/engines/project:{sfProjectId}/actions/preTranslate/{bookNum}_{chapterNum}/history";
    public const string GetPreTranslationUsfm =
        "translation/engines/project:{sfProjectId}/actions/preTranslate/{bookNum}_{chapterNum}/usfm";
    public const string GetPreTranslationUsj =
        "translation/engines/project:{sfProjectId}/actions/preTranslate/{bookNum}_{chapterNum}/usj";
    public const string GetPreTranslationUsx =
        "translation/engines/project:{sfProjectId}/actions/preTranslate/{bookNum}_{chapterNum}/usx";
    public const string GetLastCompletedPreTranslationBuild =
        "translation/engines/project:{sfProjectId}/actions/getLastCompletedPreTranslationBuild";

    /// <summary>
    /// Ensures that a user has permission to perform actions to the Serval/Machine API.
    /// </summary>
    /// <param name="userAccessor">An IUserAccessor for the acting user.</param>
    /// <param name="project">The project.</param>
    /// <param name="mustBeOnProject">If <c>true</c>, the user must be on the project.</param>
    /// <exception cref="ForbiddenException">
    /// The user does not have permission to access the Serval/Machine API.
    /// </exception>
    public static void EnsureProjectPermission(IUserAccessor userAccessor, Project project, bool mustBeOnProject)
    {
        // Check for permission
        if (!HasPermission(userAccessor, project, mustBeOnProject))
        {
            throw new ForbiddenException();
        }
    }

    public static string GetBuildHref(string sfProjectId, string buildId)
    {
        // If there is no build id, the href will end in a dot, which we must remove to have a valid URL
        string buildHref = GetBuild.Replace("{sfProjectId}", sfProjectId).Replace("{buildId?}", buildId);
        return $"{Namespace}/{buildHref}".TrimEnd('.');
    }

    public static string GetEngineHref(string sfProjectId) =>
        $"{Namespace}/{GetEngine.Replace("{sfProjectId}", sfProjectId)}";

    /// <summary>
    /// Determines if a user has permission to perform actions to the Serval/Machine API.
    /// </summary>
    /// <param name="userAccessor">An IUserAccessor for the acting user.</param>
    /// <param name="project">The project.</param>
    /// <param name="mustBeOnProject">If <c>true</c>, the user must be on the project as a Paratext user.</param>
    /// <returns><c>true</c> if the user has permission; otherwise, <c>false</c>.</returns>
    /// <remarks>
    /// A user must be an Administrator or Translator, or a Serval Admin.
    /// </remarks>
    private static bool HasPermission(IUserAccessor userAccessor, Project project, bool mustBeOnProject)
    {
        if (string.IsNullOrWhiteSpace(userAccessor.UserId))
        {
            return false;
        }

        bool isOnProject = project.UserRoles.TryGetValue(userAccessor.UserId, out string role);
        if (
            userAccessor.SystemRoles.Contains(SystemRole.ServalAdmin)
            && (!mustBeOnProject || isOnProject && SFProjectRole.IsParatextRole(role))
        )
        {
            return true;
        }

        return isOnProject && role is SFProjectRole.Administrator or SFProjectRole.Translator;
    }
}
