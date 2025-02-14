using System;
using System.IO;
using ICSharpCode.SharpZipLib.Zip;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.Users;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Mocks a resource in a zip file.
/// </summary>
public class MockResourceScrText : ResourceScrText
{
    private readonly ScrLanguage _language;
    private readonly ProjectSettings _settings;

    public MockResourceScrText(
        ProjectName name,
        ParatextUser associatedUser,
        IZippedResourcePasswordProvider passwordProvider
    )
        : base(name, associatedUser, passwordProvider)
    {
        _settings = new MockProjectSettings(this);
        // ScrText sets its cachedGuid from the settings Guid. Here we are doing it the other way around.
        // Some tests may need both MockScrText.Guid and MockScrText.Settings.Guid to be set.
        _language = new MockScrLanguage(this);
    }

    public HexId CachedGuid
    {
        set
        {
            cachedGuid = value;
            Settings.Guid = value;
        }
    }

    public ZipFile ZipFile { get; } = new ZipFile(new MemoryStream());

    protected override ProjectFileManager CreateFileManager() =>
        new MockZippedProjectFileManager(ZipFile, loadDblSettings: true, Name);

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            (ZipFile as IDisposable).Dispose();
        }
    }

    protected override void Load(bool ignoreLoadErrors = false)
    {
        // We should not load anything from disk
    }

    public override ProjectSettings Settings => _settings;
    public override ScrStylesheet DefaultStylesheet => new MockScrStylesheet("./usfm.sty");
    public override string Directory => projectName.ProjectPath;
    public override string Name => projectName.ShortName;
    public override ScrLanguage Language => _language;
}
