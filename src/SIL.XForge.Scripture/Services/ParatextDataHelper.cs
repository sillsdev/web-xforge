using Paratext.Data;
using Paratext.Data.Repository;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> Provides methods calls to Paratext Data. Can be mocked in tests. </summary>
    public class ParatextDataHelper : IParatextDataHelper
    {
        public void CommitVersionedText(ScrText scrText, string comment)
        {
            VersionedText vText = VersioningManager.Get(scrText);
            vText.Commit(comment, null, false);
        }
    }
}
