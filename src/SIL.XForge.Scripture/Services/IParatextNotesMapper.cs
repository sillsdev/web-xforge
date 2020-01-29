using System.Collections.Generic;
using System.Threading.Tasks;
using System.Xml.Linq;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextNotesMapper
    {
        List<SyncUser> NewSyncUsers { get; }

        void Init(UserSecret currentUserSecret, SFProjectSecret projectSecret);

        Task<XElement> GetNotesChangelistAsync(XElement oldNotesElem, IEnumerable<IDocument<Question>> questionsDocs);
    }
}
