namespace SIL.XForge.Scripture.Models
{
    public static class MachineApi
    {
        public const string Namespace = "machine-api/v2";
        public const string GetEngine = "translation/engines/project:{projectId}";

        public static string GetEngineHref(string projectId) =>
            $"{Namespace}/{GetEngine.Replace("{projectId}", projectId)}";
    }
}
