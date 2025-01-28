using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace SIL.Converters.Usj
{
    /// <summary>
    /// Elements shared between <see cref="Usj"/> and <see cref="UsjMarker"/>.
    /// </summary>
    [JsonObject(NamingStrategyType = typeof(LowerCaseNamingStrategy), ItemNullValueHandling = NullValueHandling.Ignore)]
    public abstract class UsjBase
    {
        /// <summary>
        /// For <see cref="Usj"/>, this is the USJ spec type.
        /// For <see cref="UsjMarker"/>, this is the kind/category of node or element this is,
        /// corresponding the USFM marker and USX node.
        /// </summary>
        /// <example><c>para</c>, <c>verse</c>, <c>char</c>.</example>
        public string Type { get; set; }

        /// <summary>
        /// The JSON representation of scripture contents from USFM/USX.
        /// </summary>
        /// <value>This will either be a <see cref="UsjMarker"/> or <see cref="string"/>.</value>
        /// <remarks>Nullable. The contents will be laid out in order.</remarks>
        [JsonConverter(typeof(UsjContentConverter))]
        public ArrayList Content { get; set; }

        /// <summary>
        /// Additional attributes that are not a part of the USJ specification.
        /// This is only used for <see cref="UsjMarker"/>.
        /// </summary>
        /// <remarks>
        /// These are typically <c>closed</c>, <c>colspan</c>, etc.
        /// </remarks>
        [JsonExtensionData]
        public Dictionary<string, object> AdditionalData { get; } = new Dictionary<string, object>();
    }
}
