namespace SIL.XForge.Scripture.Models
{
    public class ParatextSettings
    {
        /// <summary> The full name of the project from the local repository. </summary>
        public string FullName { get; set; }
        /// <summary> Whether a specific project is in a right to left language. </summary>
        public bool IsRightToLeft { get; set; }
        /// <summary> Indicates if the text in the project is editable. </summary>
        public bool Editable { get; set; }
    }
}
