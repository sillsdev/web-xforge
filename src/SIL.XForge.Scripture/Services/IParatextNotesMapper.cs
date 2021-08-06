using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextNotesMapper
    {
        Task InitAsync(UserSecret currentUserSecret, SFProjectSecret projectSecret, List<User> ptUsers,
            SFProject project, CancellationToken token);
        Task<XElement> GetNotesChangelistAsync(XElement oldNotesElem, IEnumerable<IDocument<Question>> questionsDocs,
            Dictionary<string, SyncUser> syncUsers);
    }
}
