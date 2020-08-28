using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Subclass of ParatextData ScrTextCollection that allows us to specify things like SettingsDirectory, but without
    /// additional side effects of using the full ScrTextCollection that we may not be ready for yet or not want when
    /// using ParatextData from Scripture Forge.
    /// </summary>
    public class SfScrTextCollection : ScrTextCollection
    {
        protected override string SettingsDirectoryInternal { get; set; }

        protected override void InitializeInternal(string settingsDir, bool allowMigration)
        {
            SettingsDirectoryInternal = settingsDir;
        }
    }
}
