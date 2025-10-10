using System.IO;
using ICSharpCode.SharpZipLib.Zip;

namespace SIL.XForge.Scripture.Services;

internal class MockStaticDataSource : IStaticDataSource
{
    public Stream GetSource() => new MemoryStream();
}
