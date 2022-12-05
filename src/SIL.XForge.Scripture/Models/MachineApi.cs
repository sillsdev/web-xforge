namespace SIL.XForge.Scripture.Models
{
    public static class MachineApi
    {
        public const string Namespace = "machine-api/v2";
        public const string StartBuild = "translation/builds";
        public const string GetBuild = "translation/builds/{reference}:{projectId}.{buildId?}";
        public const string GetEngine = "translation/engines/project:{projectId}";
        public const string GetWordGraph = "translation/engines/project:{projectId}/actions/getWordGraph";
        public const string TrainSegment = "translation/engines/project:{projectId}/actions/trainSegment";
        public const string Translate = "translation/engines/project:{projectId}/actions/translate";
        public const string TranslateN = "translation/engines/project:{projectId}/actions/translate/{n}";

        public static string GetBuildHref(string projectId, string buildId)
        {
            string buildHref = GetBuild
                .Replace("{projectId}", projectId)
                .Replace("{buildId?}", buildId)
                .Replace("{reference}", "id");
            return $"{Namespace}/{buildHref}";
        }

        public static string GetEngineHref(string projectId) =>
            $"{Namespace}/{GetEngine.Replace("{projectId}", projectId)}";
    }
}
