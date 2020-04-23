using Paratext.Data;
using SIL.XForge.Scripture;

namespace SIL.XForge.Scripture.Services
{
    public interface IScrTextCollection
    {
        void Initialize(string settingsDir = null);
        ScrText FindById(string username, string projectId, Models.TextType textType);
    }
}
