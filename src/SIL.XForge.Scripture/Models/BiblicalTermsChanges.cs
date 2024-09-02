using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The changes in the Biblical Terms from Paratext
/// </summary>
public class BiblicalTermsChanges
{
    public List<BiblicalTerm> BiblicalTerms { get; } = [];
    public string ErrorMessage { get; init; } = string.Empty;
    public bool HasRenderings { get; init; }
}
