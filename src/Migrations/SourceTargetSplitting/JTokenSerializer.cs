namespace SourceTargetSplitting
{
    using MongoDB.Bson.Serialization;
    using MongoDB.Bson.Serialization.Serializers;
    using Newtonsoft.Json.Linq;

    /// <summary>
    /// The BSON Document to JToken serializer.
    ///
    /// This is used so that <see cref="SIL.XForge.Realtime.RichText.Delta.Ops"/> can be deserialized from MongoDB
    /// by <see cref="SIL.XForge.Realtime.RealtimeService.QuerySnapshots"/>.
    /// </summary>
    /// <seealso cref="MongoDB.Bson.Serialization.Serializers.SerializerBase{Newtonsoft.Json.Linq.JToken}" />
    public class JTokenSerializer : SerializerBase<JToken>
    {
        /// <inheritdoc />
        public override JToken Deserialize(BsonDeserializationContext context, BsonDeserializationArgs args)
        {
            var myBSONDoc = BsonDocumentSerializer.Instance.Deserialize(context);
            return JToken.Parse(myBSONDoc.ToString());
        }

        /// <inheritdoc />
        public override void Serialize(BsonSerializationContext context, BsonSerializationArgs args, JToken value)
        {
            var myBSONDoc = MongoDB.Bson.BsonDocument.Parse(value.ToString());
            BsonDocumentSerializer.Instance.Serialize(context, myBSONDoc);
        }
    }
}
