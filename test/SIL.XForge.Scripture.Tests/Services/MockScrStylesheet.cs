using Paratext.Data;

namespace SIL.XForge.Scripture.Services;

/// <summary>Mock for tests.</summary>
public class MockScrStylesheet(string path, string? alternatePath = null) : ScrStylesheet(path, alternatePath);
