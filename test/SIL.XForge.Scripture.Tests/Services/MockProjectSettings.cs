using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;

namespace SIL.XForge.Scripture.Services;

/// <summary>Mock for tests.</summary>
public class MockProjectSettings(ScrText scrText) : ProjectSettings(scrText)
{
    public override bool Editable { get; set; } = true;
}
