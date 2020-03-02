

using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    interface IScrTextCollectionRunner
    {
        ScrText FindById(string projectId, string shortName = null, bool allowInaccessible = false, bool allowUnsupported = false);
    }
}
