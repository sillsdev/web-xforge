namespace Paratext.Data;

/// <summary>Mock for tests.</summary>
public class MockScrStylesheet : ScrStylesheet
{
    public MockScrStylesheet(string path, string alternatePath = null) : base(path, alternatePath) { }
}
