using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class UpdateTasksParams
    {
        public bool? CheckingEnabled { get; set; }
        public bool? TranslateEnabled { get; set; }
        public string SourceParatextId { get; set; }
        public InputSystem SourceInputSystem { get; set; }
    }
}
