using Newtonsoft.Json.Serialization;

namespace SIL.Converters.Usj
{
    /// <summary>
    /// Ensures that the JSON properties for the USJ data model are in lower case.
    /// </summary>
    internal class LowerCaseNamingStrategy : NamingStrategy
    {
        /// <inheritdoc />
        protected override string ResolvePropertyName(string name) => name.ToLowerInvariant();
    }
}
