using Paratext.Data;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
    public class HgHelper : IHgHelper
    {
        static HgHelper()
        {
        }
        public string GetRevisionAtTip(ScrText scrText)
        {
            return Hg.Default.GetId(scrText.Directory, "tip", true);
        }

        public void Update(string directory, string revision)
        {
            Hg.Default.Update(directory, revision);
        }
    }
}
