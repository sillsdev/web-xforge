using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class Comment : IOwnedData
{
    public string DataId { get; set; } = string.Empty;
    public string OwnerRef { get; set; } = string.Empty;

    /// <summary>
    /// The OpaqueUserId of a ParatextUserProfile. It is used to correlate comments between PT and SF. It may refer
    /// to a SF user who synchronized the comment.
    /// </summary>
    public string? SyncUserRef { get; set; }
    public string? Text { get; set; }
    public string? AudioUrl { get; set; }
    public DateTime DateModified { get; set; }
    public DateTime DateCreated { get; set; }

    /// <summary>Indicates whether a comment, note, or answer is marked deleted. </summary>
    /// <remarks>
    /// This is used for answers and comments so that they may be deleted correctly from Paratext.
    ///
    /// For notes, this property is an artifact of the legacy DataAccessServer. Marking this as true indicates
    /// that the corresponding Paratext comment not already marked deleted should be delete if it exists.
    /// </remarks>
    public bool Deleted { get; set; }
}
