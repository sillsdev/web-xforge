using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models;

public class ValidShareKey
{
    public SFProject Project { get; set; } = new SFProject();
    public SFProjectSecret ProjectSecret { get; set; } = new SFProjectSecret();
    public ShareKey ShareKey { get; set; } = new ShareKey();
}
