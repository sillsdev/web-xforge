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
    public const string GetBuilds = "translation/builds/project:{sfProjectId}";
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

    public static string GetBuildHref(string sfProjectId, string buildId)
    {
        // If there is no build id, the href will end in a dot, which we must remove to have a valid URL
        string buildHref = GetBuild.Replace("{sfProjectId}", sfProjectId).Replace("{buildId?}", buildId);
        return $"{Namespace}/{buildHref}".TrimEnd('.');
    }

    public static string GetEngineHref(string sfProjectId) =>
        $"{Namespace}/{GetEngine.Replace("{sfProjectId}", sfProjectId)}";
}
