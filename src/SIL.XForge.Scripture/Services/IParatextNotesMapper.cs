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
        CommentTags Tags { set; }

        Task InitAsync(UserSecret currentUserSecret, SFProjectSecret projectSecret, List<User> ptUsers,
            string paratextProjectId, CommentTags commentTags);
        Task<XElement> GetNotesChangelistAsync(XElement oldNotesElem, IEnumerable<IDocument<Question>> questionsDocs);
        IEnumerable<ParatextNoteThreadChange> GetNoteThreadChangesFromPT(XElement ptNotesElem,
            IEnumerable<IDocument<ParatextNoteThread>> noteThreads);
    }
}
