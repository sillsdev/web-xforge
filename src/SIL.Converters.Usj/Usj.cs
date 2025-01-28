namespace SIL.Converters.Usj
{
    /// <summary>
    /// Unified Scripture JSON (USJ) - The JSON variant of USFM and USX data models.
    /// These types follow this schema: <c>https://github.com/usfm-bible/tcdocs/blob/usj/grammar/usj.js</c>
    /// </summary>
    public class Usj : UsjBase, IUsj
    {
        /// <summary>
        /// The supported USJ spec type.
        /// </summary>
        public const string UsjType = "USJ";

        /// <summary>
        /// The supported USJ spec version.
        /// </summary>
        public const string UsjVersion = "3.1";

        /// <summary>
        /// The USJ spec version.
        /// </summary>
        public string Version { get; set; }
    }
}
