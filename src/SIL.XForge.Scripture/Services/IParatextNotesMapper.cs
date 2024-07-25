using System.Collections.Generic;
using System.Threading.Tasks;
using System.Xml.Linq;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface IParatextNotesMapper
{
    void Init(UserSecret currentUserSecret, IReadOnlyList<ParatextProjectUser> users);
    Task<XElement> GetNotesChangelistAsync(
        XElement oldNotesElem,
        IEnumerable<IDocument<Question>> questionsDocs,
        Dictionary<string, ParatextUserProfile> ptProjectUsers,
        Dictionary<string, string> userRoles,
        string answerExportMethod,
        int checkingNoteTagId
    );
}
