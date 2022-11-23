namespace SIL.XForge.Scripture.Models
{
    public static class MachineApi
    {
        public const string Namespace = "machine-api/v2";
        public const string StartBuild = "translation/builds";
        public const string GetBuild = "translation/builds/{reference}:{projectId}";
        public const string GetEngine = "translation/engines/project:{projectId}";
        public const string GetWordGraph = "translation/engines/project:{projectId}/actions/getWordGraph";

        public static string GetBuildHref(string projectId) =>
            $"{Namespace}/{GetBuild.Replace("{projectId}", projectId).Replace("{reference}", "id")}";

        public static string GetEngineHref(string projectId) =>
            $"{Namespace}/{GetEngine.Replace("{projectId}", projectId)}";
    }
}
