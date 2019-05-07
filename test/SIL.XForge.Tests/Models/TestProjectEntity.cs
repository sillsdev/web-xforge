namespace SIL.XForge.Models
{
    public class TestProjectEntity : ProjectEntity
    {
        public override ProjectRoles Roles => TestProjectRoles.Instance;
        public TestCheckingConfig CheckingConfig { get; set; } = new TestCheckingConfig();
    }
}
