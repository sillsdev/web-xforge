namespace SIL.XForge.Scripture.Services;

/// <summary>
/// This class generates IDs that are predictable and repeatable, i.e. are testable.
/// </summary>
public class TestGuidService : IGuidService
{
    private int _charID = 1;
    private int _objID = 2;

    public string Generate() => $"{_charID++}";

    public string NewObjectId() => "syncuser0" + _objID++;
}
