#nullable disable warnings
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class TranslateSource
{
    /// <summary>
    /// Gets or sets the paratext identifier.
    /// </summary>
    /// <value>
    /// The paratext identifier.
    /// </value>
    public string ParatextId { get; set; }

    /// <summary>
    /// Gets or sets the project reference. This is a reference to a SF project id.
    /// </summary>
    /// <value>
    /// The SF project id reference.
    /// </value>
    public string ProjectRef { get; set; }
    public string Name { get; set; }
    public string ShortName { get; set; }
    public WritingSystem WritingSystem { get; set; } = new WritingSystem();
    public bool? IsRightToLeft { get; set; }
}
