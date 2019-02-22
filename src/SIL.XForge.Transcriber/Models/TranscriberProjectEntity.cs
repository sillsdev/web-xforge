using SIL.XForge.Models;

namespace SIL.XForge.Transcriber.Models
{
    public class TranscriberProjectEntity : ProjectEntity
    {
        public override ProjectRoles Roles => TranscriberProjectRoles.Instance;
    }
}
