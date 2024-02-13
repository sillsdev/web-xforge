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
    public const string IsLanguageSupported = "translation/languages/{languageCode}";
    public const string TrainSegment = "translation/engines/project:{sfProjectId}/actions/trainSegment";
    public const string Translate = "translation/engines/project:{sfProjectId}/actions/translate";
    public const string TranslateN = "translation/engines/project:{sfProjectId}/actions/translate/{n}";
    public const string StartPreTranslationBuild = "translation/pretranslations";
    public const string CancelPreTranslationBuild = "translation/pretranslations/cancel";
    public const string GetPreTranslation =
        "translation/engines/project:{sfProjectId}/actions/preTranslate/{bookNum}_{chapterNum}";
    public const string GetLastCompletedPreTranslationBuild =
        "translation/engines/project:{sfProjectId}/actions/getLastCompletedPreTranslationBuild";

    public static string GetBuildHref(string sfProjectId, string buildId)
    {
        // The {locatorType} parameter is required to maintain compatibility with the v1 machine-api and machine.js
        string buildHref = GetBuild.Replace("{sfProjectId}", sfProjectId).Replace("{buildId?}", buildId);
        return $"{Namespace}/{buildHref}";
    }

    public static string GetEngineHref(string sfProjectId) =>
        $"{Namespace}/{GetEngine.Replace("{sfProjectId}", sfProjectId)}";
}
