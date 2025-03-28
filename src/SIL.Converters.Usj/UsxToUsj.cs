using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Xml;
using System.Xml.Linq;

namespace SIL.Converters.Usj
{
    /// <summary>
    /// Convert Scripture from USX to USJ.
    /// </summary>
    /// <remarks>
    /// Ported to C# from this file:
    /// <c>https://github.com/BiblioNexus-Foundation/scripture-editors/blob/main/packages/utilities/src/converters/usj/usx-to-usj.ts</c>
    /// </remarks>
    public static class UsxToUsj
    {
        /// <summary>
        /// Converts a USX string to USJ.
        /// </summary>
        /// <param name="usx">The USX string.</param>
        /// <returns>The USJ.</returns>
        public static Usj UsxStringToUsj(string usx)
        {
            if (string.IsNullOrWhiteSpace(usx))
            {
                return UsxDomToUsj(null);
            }

            XmlDocument xmlDocument = new XmlDocument
            {
                PreserveWhitespace = true, // Whitespace inside nodes is important
            };
            xmlDocument.LoadXml(usx);
            return UsxDomToUsj(xmlDocument.DocumentElement);
        }

        /// <summary>
        /// Converts a USX XDocument to USJ.
        /// </summary>
        /// <param name="document">The XML document.</param>
        /// <returns>The USJ.</returns>
        public static Usj UsxXDocumentToUsj(XDocument document)
        {
            if (document == null)
            {
                return UsxDomToUsj(null);
            }

            // Convert the XDocument to an XmlDocument, as the conversion logic is heavily dependent on XmlDocument
            XmlDocument xmlDocument = new XmlDocument
            {
                PreserveWhitespace = true, // Whitespace inside nodes is important
            };
            using (var reader = document.CreateReader())
            {
                xmlDocument.Load(reader);
            }

            return UsxDomToUsj(xmlDocument.DocumentElement);
        }

        /// <summary>
        /// Converts a USX XmlDocument to USJ.
        /// </summary>
        /// <param name="document">The XML document.</param>
        /// <returns>The USJ.</returns>
        /// <remarks>
        /// The <see cref="XmlDocument"/> should have <see cref="XmlDocument.PreserveWhitespace"/> set to <c>true</c>,
        /// if you have loaded it directly from a text file. <see cref="XmlDocument"/> objects created by ParatextData
        /// will not have this set as they are created using an <see cref="XmlWriter"/>.
        /// </remarks>
        public static Usj UsxXmlDocumentToUsj(XmlDocument document) => UsxDomToUsj(document?.DocumentElement);

        /// <summary>
        /// Indicates whether a specified string is null, empty, or XML whitespace that is not a single space.
        /// </summary>
        /// <param name="value">The string value.</param>
        /// <returns><c>true</c> if the string is null, empty, or XML whitespace.</returns>
        /// <remarks>
        /// This should be used instead of <see cref="string.IsNullOrWhiteSpace"/> for XML node values.
        /// </remarks>
        private static bool IsNullOrXmlWhitespace(string value) =>
            string.IsNullOrEmpty(value)
            || (value.All(c => c == '\t' || c == '\n' || c == '\r' || c == ' ') && value != " ");

        private static (T, bool) UsxDomToUsjRecurse<T>(XmlElement usxElement)
            where T : UsjBase, new()
        {
            string type = usxElement.Name;
            string text = null;
            bool append = true;

            // A row or cell type must be prefixed by "table:"
            if (type == "row" || type == "cell")
            {
                type = "table:" + type;
            }

            // Convert the XML attributes to a dictionary of strings
            Dictionary<string, string> attributes = usxElement
                .Attributes.Cast<XmlAttribute>()
                .ToDictionary(attrib => attrib.Name, attrib => attrib.Value);

            // If style is present, make that the marker
            if (attributes.TryGetValue("style", out string marker))
            {
                attributes.Remove("style");
            }

            // Dropping because presence of vid in para elements is not consistent in USX
            if (attributes.ContainsKey("vid"))
            {
                attributes.Remove("vid");
            }

            // Dropping because it is nonstandard derived metadata that could get out of date
            if (attributes.ContainsKey("status"))
            {
                attributes.Remove("status");
            }

            var outObj = new T { Type = type };
            if (marker != null && outObj is UsjMarker usjMarker1)
            {
                usjMarker1.Marker = marker;
            }

            // Set the attributes, placing unknown attributes in the Json Extension Data
            // This code implements the Typescript code: outObj = { ...outObj, ...attributes };
            foreach (KeyValuePair<string, string> attribute in attributes)
            {
                PropertyInfo property = outObj
                    .GetType()
                    .GetProperty(attribute.Key, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (property != null && property.CanWrite)
                {
                    // Set the property if it exists
                    property.SetValue(outObj, attribute.Value);
                }
                else
                {
                    // Add to the Json Extension Data if the property does not exist
                    outObj.AdditionalData[attribute.Key] = attribute.Value;
                }
            }

            if (
                (
                    usxElement.FirstChild?.NodeType == XmlNodeType.Text
                    || usxElement.FirstChild?.NodeType == XmlNodeType.Whitespace
                ) && !IsNullOrXmlWhitespace(usxElement.FirstChild.Value)
            )
            {
                text = usxElement.FirstChild.Value;
            }

            outObj.Content = new List<object>();
            if (!IsNullOrXmlWhitespace(text))
            {
                outObj.Content.Add(text);
            }

            foreach (XmlNode childNode in usxElement.ChildNodes)
            {
                // We are only interested in elements
                if (!(childNode is XmlElement child) || string.IsNullOrWhiteSpace(child.Name))
                {
                    continue;
                }

                (UsjMarker childDict, bool appendChild) = UsxDomToUsjRecurse<UsjMarker>(child);

                if (appendChild)
                {
                    outObj.Content.Add(childDict);
                }

                // If the next sibling is text or a user inputted space (a single space), add it to the content.
                // We skip whitespace nodes with more than one space because they are padding, not formatting spaces.
                // Note: Any Paratext 9.5 special whitespace characters will have a node type of XmlNodeType.Text.
                if (
                    child.NextSibling?.NodeType == XmlNodeType.Text
                    || (child.NextSibling?.NodeType == XmlNodeType.Whitespace && child.NextSibling.Value == " ")
                )
                {
                    outObj.Content.Add(child.NextSibling.Value);
                }
            }

            if (outObj.Content.Count == 0 && outObj.Type != Usx.UsxType)
            {
                outObj.Content = null;
            }

            if (outObj is UsjMarker usjMarker2 && usjMarker2.Eid != null && (type == "verse" || type == "chapter"))
            {
                // Omit any verse or chapter eid elements
                append = false;
            }

            return (outObj, append);
        }

        private static Usj UsxDomToUsj(XmlElement usxDom)
        {
            Usj outputJson;
            if (usxDom == null)
            {
                outputJson = new Usj { Content = new List<object>() };
            }
            else
            {
                (outputJson, _) = UsxDomToUsjRecurse<Usj>(usxDom);
            }

            outputJson.Type = Usj.UsjType;
            outputJson.Version = Usj.UsjVersion;
            return outputJson;
        }
    }
}
