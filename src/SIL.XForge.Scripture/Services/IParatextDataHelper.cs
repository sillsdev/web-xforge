using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public interface IParatextDataHelper
    {
        void CommitVersionedText(ScrText scrText, string comment);
    }
}
