using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    public interface IScrTextCollection
    {
        ScrText FindById(string username, string projectId);
    }
}
