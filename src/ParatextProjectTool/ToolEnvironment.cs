using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using Microsoft.Win32;
using NetLoc;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.Users;
using PtxUtils;
using SIL.WritingSystems;

namespace ParatextProjectTool;

/// <summary>
/// Minimal ParatextData bootstrap for running outside of Paratext, mirroring what the SF backend
/// does in ParatextService.Init() and LazyScrTextCollection.Initialize(). Keeping the two in sync
/// means projects written by this tool are exactly what SF's own ParatextData usage expects.
/// </summary>
public static class ToolEnvironment
{
    private static bool _initialized;

    /// <summary>
    /// Initializes ParatextData against the given projects directory (the directory that contains
    /// one subdirectory per project). Safe to call once per process.
    /// </summary>
    public static void Initialize(string projectsDir)
    {
        if (_initialized)
            return;
        _initialized = true;

        Trace.Listeners.Clear();
        // StringEncoders (used when reading/writing book files) requires the code-pages provider.
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        // Disable caching VersionedText instances since multiple repos may exist with the same
        // GUID (same reasoning as ParatextService.Init).
        Environment.SetEnvironmentVariable("PTD_CACHE_VERSIONED_TEXT", "DISABLED");
        RegistryU.Implementation = new ToolRegistry();
        Alert.Implementation = new ToolAlert();
        Localizer.Default = new ToolLocalizer();
        ParatextDataSettings.Initialize(new ToolParatextDataSettings());
        PtxUtilsDataSettings.Initialize(new ToolPtxUtilsSettings());
        WritingSystemRepository.Initialize();
        ScrTextCollection.Implementation = new ToolScrTextCollection();
        ScrTextCollection.Initialize(projectsDir);
        InstallStyles(projectsDir);
    }

    /// <summary>
    /// Copies usfm.sty next to the projects so ScrStylesheet can resolve each project's
    /// StyleSheet setting (same mechanism as ParatextService.InstallStyles).
    /// </summary>
    private static void InstallStyles(string projectsDir)
    {
        string assemblyDir =
            Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
            ?? throw new InvalidOperationException("Cannot determine the tool's assembly directory.");
        string source = Path.Join(assemblyDir, "usfm.sty");
        string target = Path.Join(projectsDir, "usfm.sty");
        if (!File.Exists(target) && File.Exists(source))
            File.Copy(source, target);
    }
}

/// <summary>
/// ScrTextCollection implementation that only tracks a settings directory, with the side-effectful
/// operations of the full collection disabled. Mirrors SF's SFScrTextCollection (which cannot be
/// referenced from here without pulling in the whole web application).
/// </summary>
public class ToolScrTextCollection : ScrTextCollection
{
    protected override string? DictionariesDirectoryInternal => null;

    protected override void InitializeInternal(string? settingsDir, bool allowMigration)
    {
        if (SettingsDirectoryInternal != null && (SettingsDirectoryInternal == settingsDir || settingsDir == null))
            return;
        if (settingsDir != null)
            SettingsDirectoryInternal = settingsDir;
    }

    protected override void RefreshScrTextsInternal(bool allowMigration) =>
        throw new NotImplementedException("Not used by this tool.");

    protected override string SelectSettingsFolder() => throw new NotImplementedException("Not used by this tool.");

    protected override void DeleteDirToRecycleBin(string dir) =>
        throw new NotImplementedException("Not used by this tool.");

    protected override WritingSystemDefinition? CreateWsDef(string languageId, bool allowSldr) => null;

    protected override UnsupportedReason MigrateProjectIfNeeded(ScrText scrText) =>
        throw new NotImplementedException("Not used by this tool.");

    protected override ScrText CreateResourceProject(ProjectName name) =>
        throw new NotImplementedException("Not used by this tool.");
}

/// <summary>
/// The ParatextUser this tool acts as when reading and writing project data. Mirrors SF's
/// SFParatextUser: the name is taken at face value (no registration).
/// </summary>
public class ToolParatextUser(string ptUsername) : ParatextUser(ptUsername, true) { }

/// <summary>
/// English-only localizer. Without one, PtxUtils' fallback localizer prints a warning on stdout,
/// which would corrupt this tool's JSON output.
/// </summary>
public class ToolLocalizer : Localizer
{
    public override string LanguageId
    {
        get => "en";
        set { }
    }

    public override string this[LocKey key, string? fallbackKey = null] => key.DefaultValue;

    public override LocLanguage? LocLanguage => null;

#pragma warning disable CS0067 // events are required by the base class but never raised
    public override event EventHandler? LanguageChanged;
    public override event EventHandler<ControlLocalizedEventArgs>? ControlLocalized;
#pragma warning restore CS0067

    [Obsolete("This functionality is no longer maintained")]
    public override void RegisterAndUpdateLocUpdater(LocUpdater locUpdater) => locUpdater.Update(this);

    [Obsolete("This functionality is no longer maintained")]
    public override void UnregisterLocUpdater(LocUpdater locUpdater) { }

    [Obsolete("This functionality is no longer maintained")]
    public override void RegisterLocUpdater(LocUpdater locUpdater) { }

    public override string LanguageIdToFullName(string languageId) => languageId;
}

/// <summary> Dummy Windows-registry implementation (same as SF's DotNetCoreRegistry). </summary>
public class ToolRegistry : RegistryU
{
    protected override bool ValueExistsInternal(string registryPath) => false;

    protected override bool KeyExistsInternal(string registryPath) => false;

    protected override bool KeyExistsInternal(RegistryKey key, string subKey) => false;

    protected override bool RegEntryExistsInternal(RegistryKey key, string subKey, string regEntry, out object? value)
    {
        value = null;
        return false;
    }

    protected override object? GetValInternal(string baseKey, string subKey, string key) => null;

    protected override object? GetValInternal(string registryPath) => null;

    protected override object? GetValIfExistsInternal(string registryPath) => null;

    protected override string? GetStringInternal(string basekey, string path, string key) => null;

    protected override string? GetStringInternal(string registryPath) => null;

    protected override void DelKeyInternal(string baseKey, string subKey) { }

    protected override void DelKeyInternal(string registryPath) { }

    protected override void SetValInternal(string baseKey, string subKey, string key, object theValue) { }

    protected override void SetValInternal(string registryPath, object theValue) { }

    protected override bool HasWritePermissionInternal(string registryPath) => false;
}

/// <summary>
/// Alert sink that reports ParatextData alerts on stderr instead of showing UI (the tool is
/// headless; alerts during project writes indicate a real problem worth surfacing).
/// </summary>
public class ToolAlert : Alert
{
    protected override AlertResult ShowInternal(
        IComponent? owner,
        string text,
        string caption,
        AlertButtons alertButtons,
        AlertLevel alertLevel,
        AlertDefaultButton defaultButton,
        bool showInTaskbar
    )
    {
        Console.Error.WriteLine($"Alert: {caption}: {text}");
        return AlertResult.Positive;
    }

    protected override void ShowLaterInternal(string text, string caption, AlertLevel alertLevel) =>
        Console.Error.WriteLine($"Deferred alert: {caption}: {text}");
}

/// <summary> In-memory ParatextData settings (same as SF's PersistedParatextDataSettings). </summary>
public class ToolParatextDataSettings : IParatextDataSettings
{
    public SerializableStringDictionary? LastRegistryDataCachedTimes { get; set; }

    public void SafeSave() { }
}

/// <summary> In-memory PtxUtils settings (same as SF's PersistedPtxUtilsSettings). </summary>
public class ToolPtxUtilsSettings : IPtxUtilsSettings
{
    public SerializableStringDictionary? MementoData { get; set; }
    public bool UpgradeNeeded { get; set; }
    public bool EnableFormSnapping { get; set; }

    public void SafeSave() { }
}
