using JsonApiDotNetCore.Models;

namespace SIL.XForge.Models
{
    public class TestResource : Resource
    {
        [Attr("str")]
        public string Str { get; set; }
        [Attr("num")]
        public int Num { get; set; }

        [HasOne("project", withForeignKey: nameof(ProjectRef))]
        public TestProjectResource Project { get; set; }
        public string ProjectRef { get; set; }
    }
}
