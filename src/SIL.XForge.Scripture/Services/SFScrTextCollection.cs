using System;
using System.Collections.Generic;
using Paratext.Data;
using SIL.WritingSystems;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Subclass of ParatextData ScrTextCollection that allows us to specify things like SettingsDirectory, but without
/// additional side effects of using the full ScrTextCollection that we may not be ready for yet or not want when
/// using ParatextData from Scripture Forge.
/// </summary>
public class SFScrTextCollection : ScrTextCollection
{
    // Keep track of languages that weren't found in SLDR so we don't call over and over for the same bad code.
    private static readonly List<string> _sldrLookupFailed = new List<string>();

    protected override string DictionariesDirectoryInternal => null;

    protected override void InitializeInternal(string settingsDir, bool allowMigration)
    {
        if (SettingsDirectoryInternal != null && (SettingsDirectoryInternal == settingsDir || settingsDir == null))
            return;

        // Get settings directory
        if (settingsDir != null)
            SettingsDirectoryInternal = settingsDir;
    }

    protected override void RefreshScrTextsInternal(bool allowMigration) =>
        throw new NotImplementedException("This method should not be used in SF context.");

    protected override string SelectSettingsFolder() =>
        throw new NotImplementedException("This method should not be used in SF context.");

    protected override void DeleteDirToRecycleBin(string dir) =>
        throw new NotImplementedException("This method should not be used in SF context.");

    /// <remarks>This method's implementation was mostly copied from ParatextBase.</remarks>
    protected override WritingSystemDefinition CreateWsDef(string languageId, bool allowSldr)
    {
        // Only check SLDR if allowed for this call and all internet access is enabled - SLDR isn't set up to use proxy.
        WritingSystemDefinition wsDef = null;
        if (allowSldr && InternetAccess.Status == InternetUse.Enabled && !_sldrLookupFailed.Contains(languageId))
        {
            try
            {
                var sldrFactory = new SldrWritingSystemFactory();
                sldrFactory.Create(languageId, out wsDef);
            }
            catch (Exception)
            {
                // Ignore any SLDR errors - there have been problems with entries on the server failing to parse.
                // Also the id being provided may not be valid.
                _sldrLookupFailed.Add(languageId);
            }
        }
        return wsDef;
    }

    protected override UnsupportedReason MigrateProjectIfNeeded(ScrText scrText) =>
        throw new NotImplementedException("This method should not be used in SF context.");

    protected override ScrText CreateResourceProject(ProjectName name) =>
        throw new NotImplementedException("This method should not be used in SF context.");

    protected override ScrText MarbleResourceLookup(string name) =>
        throw new NotImplementedException("This method should not be used in SF context.");
}
