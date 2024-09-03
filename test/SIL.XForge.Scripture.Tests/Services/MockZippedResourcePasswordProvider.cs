using Paratext.Data.ProjectFileAccess;

namespace SIL.XForge.Scripture.Services;

public class MockZippedResourcePasswordProvider : IZippedResourcePasswordProvider
{
    public string GetPassword() => "password";
}
