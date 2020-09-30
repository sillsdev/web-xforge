using System;
using Paratext.Data;
using SIL.WritingSystems;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Subclass of ParatextData ScrTextCollection that allows us to specify things like SettingsDirectory, but without
    /// additional side effects of using the full ScrTextCollection that we may not be ready for yet or not want when
    /// using ParatextData from Scripture Forge.
    /// </summary>
    public class SFScrTextCollection : ScrTextCollection
    {
        protected override string DictionariesDirectoryInternal => null;

        protected override void InitializeInternal(string settingsDir, bool allowMigration)
        {
            if (SettingsDirectoryInternal != null && (SettingsDirectoryInternal == settingsDir || settingsDir == null))
                return;

            // Get settings directory
            if (settingsDir != null)
                SettingsDirectoryInternal = settingsDir;
        }

        protected override void RefreshScrTextsInternal(bool allowMigration)
        {
            throw new NotImplementedException("This method should not be used in SF context.");
        }

        protected override string SelectSettingsFolder()
        {
            throw new NotImplementedException("This method should not be used in SF context.");
        }

        protected override void DeleteDirToRecycleBin(string dir)
        {
            throw new NotImplementedException("This method should not be used in SF context.");
        }

        protected override WritingSystemDefinition CreateWsDef(string languageId, bool allowSldr)
        {
            return null;
        }

        protected override UnsupportedReason MigrateProjectIfNeeded(ScrText scrText)
        {
            throw new NotImplementedException("This method should not be used in SF context.");
        }

        protected override ScrText CreateResourceProject(ProjectName name)
        {
            throw new NotImplementedException("This method should not be used in SF context.");
        }

        protected override ScrText MarbleResourceLookup(string name)
        {
            throw new NotImplementedException("This method should not be used in SF context.");
        }
    }
}
