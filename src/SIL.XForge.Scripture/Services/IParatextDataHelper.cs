using Paratext.Data;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextDataHelper
    {
        void CommitVersionedText(ScrText scrText, string comment);
    }
}
