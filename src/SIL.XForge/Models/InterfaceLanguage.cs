namespace SIL.XForge.Models
{
    public class InterfaceLanguage
    {
        public string LocalName { get; set; }
        public string EnglishName { get; set; }
        public string CanonicalTag { get; set; }
        public string Direction { get; set; } = LanguageDirection.LTR;
        public string[] Tags { get; set; }
        public bool Production { get; set; }
    }
}
