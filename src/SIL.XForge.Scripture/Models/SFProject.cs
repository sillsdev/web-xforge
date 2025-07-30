using System;
using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

/// <summary>Description of an SF project.</summary>
public class SFProject : Project
{
    public string ParatextId { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public WritingSystem WritingSystem { get; set; } = new WritingSystem();
    public bool? IsRightToLeft { get; set; }
    public TranslateConfig TranslateConfig { get; set; } = new TranslateConfig();
    public CheckingConfig CheckingConfig { get; set; } = new CheckingConfig();
    public ResourceConfig? ResourceConfig { get; set; }
    public List<TextInfo> Texts { get; set; } = [];
    public Sync Sync { get; set; } = new Sync();

    /// <summary>
    /// Paratext users on this SF project that are associated with a project component (e.g. a note)
    /// </summary>
    public List<ParatextUserProfile> ParatextUsers { get; set; } = [];

    [Obsolete("To disable editing on older frontend clients. Deprecated August 2025.")]
    public bool Editable { get; set; }
    public EditingRequires EditingRequires { get; set; }
    public int? DefaultFontSize { get; set; }
    public string? DefaultFont { get; set; }
    public List<NoteTag> NoteTags { get; set; } = [];
    public BiblicalTermsConfig BiblicalTermsConfig { get; set; } = new BiblicalTermsConfig();

    /// <summary>
    /// Used as a rate limiter for transparent authentication to limit the risk of abuse creating auth0 users.
    /// There may be some projects that will want this increased which can be done manually in the database
    /// </summary>
    public int? MaxGeneratedUsersPerShareKey { get; set; } = 250;

    /// <summary>
    /// Gets or sets the copyright banner that must be displayed when the text is displayed.
    /// </summary>
    /// <value>The copyright banner.</value>
    /// <remarks>This is plain text.</remarks>
    public string? CopyrightBanner { get; set; }

    /// <summary>
    /// Gets or sets the full copyright notice.
    /// </summary>
    /// <value>The copyright notice.</value>
    /// <remarks>This is may be plain text or HTML formatted.</remarks>
    public string? CopyrightNotice { get; set; }
}
