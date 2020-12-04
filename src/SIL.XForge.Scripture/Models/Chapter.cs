using MongoDB.Bson.Serialization.Attributes;

namespace SIL.XForge.Scripture.Models
{
    [BsonIgnoreExtraElements]
    public class Chapter
    {
        public int Number { get; set; }
        public int LastVerse { get; set; }
        /// <summary>Whether the chapter's USX conforms to the usx-sf SF USX
        /// schema, which is a subset of the USX schema. If not, it will not
        /// be editable in SF.</summary>
        public bool IsValid { get; set; }
    }
}
