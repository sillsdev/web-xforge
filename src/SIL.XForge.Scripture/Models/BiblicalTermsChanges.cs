using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The changes in the Biblical Terms from Paratext
/// </summary>
public record BiblicalTermsChanges
{
    public List<BiblicalTerm> BiblicalTerms = new List<BiblicalTerm>();
    public string ErrorMessage { get; set; } = string.Empty;
    public bool HasRenderings { get; set; }
}
