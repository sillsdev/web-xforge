using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public class MockHgHelper : IHgHelper
    {
        static MockHgHelper()
        {
        }

        public string GetRevisionAtTip(ScrText scrText)
        {
            return "revision0123";
        }

        public void Update(string directory, string revision)
        {
        }
    }
}
