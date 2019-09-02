using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class TranslateSource
    {
        public string ParatextId { get; set; }
        public string Name { get; set; }
        public InputSystem InputSystem { get; set; } = new InputSystem();
    }
}
