namespace SIL.XForge.Models
{
    public class TestProject : Project
    {
        public override ProjectRoles Roles => TestProjectRoles.Instance;
    }
}
