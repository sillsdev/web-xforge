using System.Collections.Generic;

namespace SIL.Converters.Usj
{
    /// <summary>
    /// An interface for Unified Scripture JSON (USJ) types.
    /// </summary>
    public interface IUsj
    {
        /// <summary>
        /// The JSON representation of scripture contents from USFM/USX.
        /// </summary>
        /// <value>This will either be a <see cref="UsjMarker"/> or <see cref="string"/>.</value>
        /// <remarks>Nullable. The contents will be laid out in order.</remarks>
        ICollection<object> Content { get; }

        /// <summary>
        /// The USJ spec type.
        /// </summary>
        string Type { get; }

        /// <summary>
        /// The USJ spec version.
        /// </summary>
        string Version { get; }
    }
}
