namespace Paratext.Data.ProjectSettingsAccess;

/// <summary>Mock for tests.</summary>
public class MockProjectSettings : ProjectSettings
{
    private bool _editable = true;

    public MockProjectSettings(ScrText scrText) : base(scrText) { }

    public override bool Editable
    {
        get => _editable;
        set => _editable = value;
    }
}
