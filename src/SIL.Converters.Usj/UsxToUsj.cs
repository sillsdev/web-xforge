using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Xml;

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

            // If style is present, make that the market
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
            foreach (KeyValuePair<string, string> attrib in attributes)
            {
                PropertyInfo property = outObj
                    .GetType()
                    .GetProperty(attrib.Key, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (property != null && property.CanWrite)
                {
                    // Set the property if it exists
                    property.SetValue(outObj, attrib.Value);
                }
                else
                {
                    // Add to the Json Extension Data if the property does not exist
                    outObj.AdditionalData[attrib.Key] = attrib.Value;
                }
            }

            if (
                usxElement.FirstChild?.NodeType == XmlNodeType.Text
                && !string.IsNullOrWhiteSpace(usxElement.FirstChild.Value)
            )
            {
                text = usxElement.FirstChild.Value;
            }

            outObj.Content = new ArrayList();
            if (!string.IsNullOrWhiteSpace(text))
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
                // Ignore
                append = false;
            }

            return (outObj, append);
        }

        private static Usj UsxDomToUsj(XmlElement usxDom)
        {
            Usj outputJson;
            if (usxDom == null)
            {
                outputJson = new Usj { Content = new ArrayList() };
            }
            else
            {
                (outputJson, _) = UsxDomToUsjRecurse<Usj>(usxDom);
            }

            outputJson.Type = Usj.UsjType;
            outputJson.Version = Usj.UsjVersion;
            return outputJson;
        }

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
        /// Converts a USX Xml Document to USJ.
        /// </summary>
        /// <param name="xmlDocument">The XML document.</param>
        /// <returns>The USJ.</returns>
        /// <remarks>
        /// The <see cref="XmlDocument"/> should have <see cref="XmlDocument.PreserveWhitespace"/> set to <c>true</c>.
        /// </remarks>
        public static Usj UsxXmlDocumentToUsj(XmlDocument xmlDocument) => UsxDomToUsj(xmlDocument?.DocumentElement);
    }
}
