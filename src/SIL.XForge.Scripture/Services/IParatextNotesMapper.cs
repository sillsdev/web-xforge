using System.Collections.Generic;
using System.Threading.Tasks;
using System.Xml.Linq;
using Paratext.Data.ProjectComments;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextNotesMapper
    {
        List<SyncUser> NewSyncUsers { get; }

        Task InitAsync(UserSecret currentUserSecret, SFProjectSecret projectSecret, List<User> ptUsers,
            string paratextProjectId);
        Task<XElement> GetNotesChangelistAsync(XElement oldNotesElem, IEnumerable<IDocument<Question>> questionsDocs);
        IEnumerable<ParatextNoteThreadChange> PTCommentThreadChanges(
            IEnumerable<IDocument<ParatextNoteThread>> noteThreadDocs, IEnumerable<CommentThread> commentThreads,
            CommentTags commentTags);

        List<List<Paratext.Data.ProjectComments.Comment>> SFNotesToCommentChangeList(
            IEnumerable<IDocument<ParatextNoteThread>> noteThreadDocs,
            IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads,
            CommentTags commentTags);
    }
}
