using Paratext.Data;
using Paratext.Data.Languages;
using PtxUtils;
using SIL.WritingSystems;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Replaces a ScrLanguage for use in testing. Does not use the file system to save/load data.
/// </summary>
public class MockScrLanguage(ScrText scrText) : ScrLanguage(null, ProjectNormalization.Undefined, scrText)
{
    protected override WritingSystemDefinition LoadWsDef(ScrText scrText) => wsDef;
}
