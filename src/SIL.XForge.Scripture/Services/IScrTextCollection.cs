using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public interface IScrTextCollection
    {
        void Initialize(string settingsDir = null);
        ScrText FindById(string username, string projectId, Models.TextType textType);
    }
}
