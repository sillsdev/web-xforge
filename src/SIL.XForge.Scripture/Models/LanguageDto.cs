namespace SIL.XForge.Scripture.Models;

/// <summary>
/// A DTO for the Machine API returning whether a language is supported by Serval.
/// </summary>
public class LanguageDto
{
    /// <summary>
    /// Gets or sets a value indicating whether the language is natively supported by Serval.
    /// </summary>
    public bool IsSupported { get; set; }

    /// <summary>
    /// Gets or sets the language code that Serval will use internally.
    /// </summary>
    public string LanguageCode { get; set; } = string.Empty;
}
