using System.Threading.Tasks;
using SIL.Scripture;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Calculates translation progress from the text documents in the MongoDB texts collection.
/// </summary>
public interface ITextProgressService
{
    /// <param name="projectId">The project whose text documents to aggregate.</param>
    /// <param name="versification">
    /// The versification that supplies the expected verse counts of the books and chapters.
    /// </param>
    Task<BookProgress[]> GetBookProgressAsync(string projectId, ScrVers versification);
}
