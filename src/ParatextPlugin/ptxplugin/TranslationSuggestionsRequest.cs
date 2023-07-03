namespace SIL.SFPlugin
{
    /// <summary>
    /// A Translations Suggestions Request to Scripture Forge.
    /// </summary>
    public class TranslationSuggestionsRequest
    {
        /// <summary>
        /// Gets or sets the verse reference.
        /// </summary>
        /// <value>
        /// The verse reference in BBBCCCVVV format.
        /// </value>
        public int BBBCCCVVV { get; set; }

        /// <summary>
        /// Gets or sets the project's Paratext Identifier.
        /// </summary>
        /// <value>
        /// The Paratext Identifier.
        /// </value>
        public string ParatextId { get; set; }

        /// <summary>
        /// Gets or sets the current verse text.
        /// </summary>
        /// <value>
        /// The verse text.
        /// </value>
        public string Text { get; set; }
    }
}
