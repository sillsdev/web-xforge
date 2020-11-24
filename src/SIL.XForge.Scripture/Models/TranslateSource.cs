using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class TranslateSource
    {
        /// <summary>
        /// Gets or sets the paratext identifier.
        /// </summary>
        /// <value>
        /// The paratext identifier.
        /// </value>
        /// <remarks>
        /// Only use this if <see cref="TranslateConfig.TranslationSuggestionsEnabled" /> is set to <c>true.</c>
        /// </remarks>
        public string ParatextId { get; set; }

        /// <summary>
        /// Gets or sets the project reference.
        /// </summary>
        /// <value>
        /// The project reference.
        /// </value>
        /// <remarks>
        /// Only use this if <see cref="TranslateConfig.TranslationSuggestionsEnabled" /> is set to <c>true.</c>
        /// </remarks>
        public string ProjectRef { get; set; }
        public string Name { get; set; }
        public string ShortName { get; set; }
        public WritingSystem WritingSystem { get; set; } = new WritingSystem();
        public bool? IsRightToLeft { get; set; }
    }
}
