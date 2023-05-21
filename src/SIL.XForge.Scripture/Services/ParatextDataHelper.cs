using System;
using System.Collections.Generic;
using System.Linq;
using Paratext.Data;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services;

/// <summary> Provides methods calls to Paratext Data. Can be mocked in tests. </summary>
public class ParatextDataHelper : IParatextDataHelper
{
    public void CommitVersionedText(ScrText scrText, string comment)
    {
        VersionedText vText = VersioningManager.Get(scrText);
        vText.Commit(comment, null, false);
    }

    /// <summary>
    /// Gets the changes made in the specified revisions to the ScrText.
    /// </summary>
    /// <param name="scrText">The Paratext ScrText</param>
    /// <param name="revisionIds">The revision identifiers.</param>
    /// <returns>
    /// A collection of tuples, where the first value is the file type,
    /// and the second value is an array of the affected book numbers.
    /// </returns>
    public IEnumerable<(ProjectFileType, int[])> GetRevisionChanges(ScrText scrText, string[] revisionIds)
    {
        VersionedText versionedText = VersioningManager.Get(scrText);
        List<HgRevision> revisions = Hg.Default.GetLog(
            versionedText.Repository,
            revisionIds.First(),
            revisionIds.Last()
        );
        return revisions
            .Select(revision => new RevisionChangeInfo(versionedText, revision))
            .SelectMany(summary => summary.FilesChanged)
            .Select(
                c =>
                    (
                        c.Key,
                        c.Key == ProjectFileType.Books
                            ? c.Value.Where(f => f.File is not null).Select(f => f.File.BookNum).ToArray()
                            : Array.Empty<int>()
                    )
            );
    }
}
