using System.Collections.Generic;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The results of what was modified in the Paratext sync, so we can optimize the updating of Scripture Forge.
/// </summary>
public class ParatextSyncResults
{
    /// <summary>
    /// Gets the books that this sync modifies
    /// </summary>
    /// <value>The book numbers that have been modified in the sync.</value>
    /// <remarks>This is a HashSet so that there are no duplicates.</remarks>
    public HashSet<int> Books { get; set; } = new HashSet<int>();

    /// <summary>
    /// Gets or sets a value indicating whether this sync is for a resource
    /// </summary>
    /// <value><c>true</c> if this is a resource; otherwise, <c>false</c>.</value>
    public bool IsResource { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether notes have been updated.
    /// </summary>
    /// <value><c>true</c> if the notes have been updated; otherwise, <c>false</c>.</value>
    public bool NotesChanged { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether permissions have been updated.
    /// </summary>
    /// <value><c>true</c> if the permissions have been updated; otherwise, <c>false</c>.</value>
    public bool PermissionsChanged { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether a project level change has taken place.
    /// This will result in all Scripture Forge data being checked for changes.
    /// </summary>
    /// <value><c>true</c> if the project has changed otherwise, <c>false</c>.</value>
    public bool ProjectChanged { get; set; }

    /// <summary>
    /// Determines whether a book should be updated in Scripture Forge.
    /// </summary>
    /// <param name="bookNum">The book number.</param>
    /// <returns><c>true</c> if the book should be updated; otherwise, <c>false</c>.</returns>
    public bool UpdateBook(int bookNum) => ProjectChanged || IsResource || Books.Contains(bookNum);

    /// <summary>
    /// Gets a value indicating whether the notes should be updated in Scripture Forge.
    /// </summary>
    /// <returns><c>true</c> if the notes should be updated; otherwise, <c>false</c>.</returns>
    public bool UpdateNotes => ProjectChanged || NotesChanged;

    /// <summary>
    /// Gets a value indicating whether the book and chapter should be updated in Scripture Forge.
    /// </summary>
    /// <returns><c>true</c> if the roles should be updated; otherwise, <c>false</c>.</returns>
    public bool UpdatePermissions => ProjectChanged || IsResource || PermissionsChanged || Books.Count > 0;

    /// <summary>
    /// Gets a value indicating whether the roles should be updated in Scripture Forge.
    /// </summary>
    /// <returns><c>true</c> if the roles should be updated; otherwise, <c>false</c>.</returns>
    public bool UpdateRoles => ProjectChanged || PermissionsChanged;
}
