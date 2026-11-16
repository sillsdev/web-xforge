using System.Text.Json.Serialization;

namespace SIL.XForge.Scripture.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum DraftingEngine
{
    Nmt,
    Echo,
    Llm,
    NmtWithFastTraining,
    NmtWithLlmPostProcessing,
}
