namespace SIL.Converters.Usj
{
    /// <summary>
    /// A Scripture Marker and its contents.
    /// </summary>
    public class UsjMarker : UsjBase
    {
        /// <summary>
        /// The corresponding marker in USFM or style in USX.
        /// </summary>
        /// <example><c>p</c>, <c>v</c>, <c>nd</c>.</example>
        public string Marker { get; set; }

        /// <summary>
        /// The milestone start ID, which indicates the Book-chapter-verse value in the paragraph based structure.
        /// </summary>
        /// <remarks>Nullable.</remarks>
        public string Sid { get; set; }

        /// <summary>
        /// Milestone end ID, which matches the milestone start ID <see cref="Sid"/>.
        /// <see cref="Eid"/> is not specified in the USJ spec, but is kept for USX compatibility.
        /// </summary>
        /// <remarks>Nullable.</remarks>
        public string Eid { get; set; }

        /// <summary>
        /// Chapter number or verse number.
        /// </summary>
        /// <remarks>Nullable.</remarks>
        public string Number { get; set; }

        /// <summary>
        /// The 3-letter book code in ID element.
        /// </summary>
        /// <remarks>Nullable.</remarks>
        public string Code { get; set; }

        /// <summary>
        /// Alternate chapter number or verse number.
        /// </summary>
        /// <remarks>Nullable.</remarks>
        public string AltNumber { get; set; }

        /// <summary>
        /// Published character of a chapter or verse.
        /// </summary>
        /// <value>
        /// This can be a letter (I, II, etc.), a number (1, 2, ...), or both.
        /// It is only displayed in the published version of the scripture text.
        /// </value>
        /// <remarks>Nullable.</remarks>
        public string PubNumber { get; set; }

        /// <summary>
        /// Caller character for footnotes and cross-refs.
        /// </summary>
        /// <remarks>Nullable.</remarks>
        public string Caller { get; set; }

        /// <summary>
        /// Alignment of table cells.
        /// </summary>
        /// <remarks>Nullable.</remarks>
        public string Align { get; set; }

        /// <summary>
        /// Category of extended study bible sections.
        /// </summary>
        /// <remarks>Nullable.</remarks>
        public string Category { get; set; }
    }
}
