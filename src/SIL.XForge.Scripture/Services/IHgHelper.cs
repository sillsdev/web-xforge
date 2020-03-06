using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    interface IHgHelper
    {
        string GetRevisionAtTip(ScrText scrtext);
        void Update(string directory, string revision);
    }
}
