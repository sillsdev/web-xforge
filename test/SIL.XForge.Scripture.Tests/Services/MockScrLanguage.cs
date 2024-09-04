using Paratext.Data;
using Paratext.Data.Languages;
using PtxUtils;
using SIL.WritingSystems;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Replaces a ScrLanguage for use in testing. Does not use the file system to save/load data.
/// </summary>
class MockScrLanguage : ScrLanguage
{
    internal MockScrLanguage(ScrText scrText)
        : base(null, ProjectNormalization.Undefined, scrText) { }

    // Don't load anything from disk for testing and just return the one we already have
    protected override WritingSystemDefinition LoadWsDef(ScrText scrText) => wsDef;
}
