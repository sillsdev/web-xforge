namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Machine API URL strings and helper methods.
    /// </summary>
    public static class MachineApi
    {
        public const string Namespace = "machine-api/v2";
        public const string StartBuild = "translation/builds";
        public const string GetBuild = "translation/builds/{reference}:{sfProjectId}.{buildId?}";
        public const string GetEngine = "translation/engines/project:{sfProjectId}";
        public const string GetWordGraph = "translation/engines/project:{sfProjectId}/actions/getWordGraph";
        public const string TrainSegment = "translation/engines/project:{sfProjectId}/actions/trainSegment";
        public const string Translate = "translation/engines/project:{sfProjectId}/actions/translate";
        public const string TranslateN = "translation/engines/project:{sfProjectId}/actions/translate/{n}";

        public static string GetBuildHref(string sfProjectId, string buildId)
        {
            // The {reference} parameter is required to maintain compatibility with the v1 machine-api and machine.js
            string buildHref = GetBuild
                .Replace("{sfProjectId}", sfProjectId)
                .Replace("{buildId?}", buildId)
                .Replace("{reference}", "id");
            return $"{Namespace}/{buildHref}";
        }

        public static string GetEngineHref(string sfProjectId) =>
            $"{Namespace}/{GetEngine.Replace("{sfProjectId}", sfProjectId)}";
    }
}
