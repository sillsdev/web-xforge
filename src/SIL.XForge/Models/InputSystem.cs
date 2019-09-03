namespace SIL.XForge.Models
{
    public class InputSystem
    {
        public InputSystem(string tag = "qaa", string name = "")
        {
            Tag = tag;
            LanguageName = name;
        }

        public string Tag { get; set; }
        public string LanguageName { get; set; }
        public bool IsRightToLeft { get; set; }
    }
}
