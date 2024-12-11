using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Linq.Expressions;
using System.Threading.Tasks;
using MongoDB.Bson;
using Newtonsoft.Json;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.DataAccess;

[ExcludeFromCodeCoverage(Justification = "This class is used exclusively in unit tests.")]
public class MemoryRepository<T> : IRepository<T>
    where T : IIdentifiable
{
    private static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
    {
        TypeNameHandling = TypeNameHandling.Auto,
        ContractResolver = new WritableContractResolver(),
        Converters = [new BsonValueConverter()],
    };

    private readonly ConcurrentDictionary<string, string> _entities;
    private readonly Func<T, object>[] _uniqueKeySelectors;
    private readonly HashSet<object>[] _uniqueKeys;

    public MemoryRepository(IEnumerable<T> entities)
        : this(null, entities) { }

    public MemoryRepository(IEnumerable<Func<T, object>>? uniqueKeySelectors = null, IEnumerable<T>? entities = null)
    {
        _uniqueKeySelectors = uniqueKeySelectors?.ToArray() ?? [];
        _uniqueKeys = new HashSet<object>[_uniqueKeySelectors.Length];
        for (int i = 0; i < _uniqueKeys.Length; i++)
            _uniqueKeys[i] = [];

        _entities = new ConcurrentDictionary<string, string>();
        if (entities != null)
            Add(entities);
    }

    public void Init() { }

    public void Add(T entity)
    {
        for (int i = 0; i < _uniqueKeySelectors.Length; i++)
        {
            object key = _uniqueKeySelectors[i](entity);
            if (key != null)
                _uniqueKeys[i].Add(key);
        }
        _entities[entity.Id] = JsonConvert.SerializeObject(entity, Settings);
    }

    public void Add(IEnumerable<T> entities)
    {
        foreach (T entity in entities)
            Add(entity);
    }

    public void Remove(T entity)
    {
        for (int i = 0; i < _uniqueKeySelectors.Length; i++)
        {
            object key = _uniqueKeySelectors[i](entity);
            if (key != null)
                _uniqueKeys[i].Remove(key);
        }
        _entities.TryRemove(entity.Id, out _);
    }

    public void Replace(T entity)
    {
        if (_entities.TryGetValue(entity.Id, out string existingStr))
        {
            T existing = DeserializeEntity(entity.Id, existingStr);
            Remove(existing);
        }
        Add(entity);
    }

    public bool Contains(string id) => _entities.ContainsKey(id);

    public T Get(string id) => DeserializeEntity(id, _entities[id]);

    public IQueryable<T> Query() => _entities.Select(kvp => DeserializeEntity(kvp.Key, kvp.Value)).AsQueryable();

    public Task InsertAsync(T entity)
    {
        if (string.IsNullOrEmpty(entity.Id))
            entity.Id = ObjectId.GenerateNewId().ToString();

        if (_entities.ContainsKey(entity.Id) || CheckDuplicateKeys(entity))
            throw new DuplicateKeyException();

        Add(entity);
        return Task.FromResult(true);
    }

    public Task<bool> ReplaceAsync(T entity, bool upsert = false)
    {
        if (string.IsNullOrEmpty(entity.Id))
            entity.Id = ObjectId.GenerateNewId().ToString();

        if (_entities.ContainsKey(entity.Id) || upsert)
        {
            Replace(entity);
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    public Task<T> UpdateAsync(Expression<Func<T, bool>> filter, Action<IUpdateBuilder<T>> update, bool upsert = false)
    {
        Func<T, bool> filterFunc = filter.Compile();
        T entity = Query()
            .AsEnumerable()
            .FirstOrDefault(e =>
            {
                try
                {
                    return filterFunc(e);
                }
                catch (Exception)
                {
                    return false;
                }
            });
        if (entity != null || upsert)
        {
            T original = default;
            bool isInsert = entity == null;
            if (isInsert)
            {
                entity = (T)Activator.CreateInstance(typeof(T));
                string id = ObjectId.GenerateNewId().ToString();
                if (filter.Body is BinaryExpression binaryExpr)
                {
                    object value = ExpressionHelper.FindConstantValue(binaryExpr.Right);
                    if (value is string stringValue)
                        id = stringValue;
                }
                entity!.Id = id;
            }
            else
            {
                original = Query().FirstOrDefault(filter);
            }

            var builder = new MemoryUpdateBuilder<T>(filter, entity, isInsert);
            update(builder);

            if (CheckDuplicateKeys(entity, original))
                throw new DuplicateKeyException();

            Replace(entity);
        }
        return Task.FromResult(entity);
    }

    public Task<T> DeleteAsync(Expression<Func<T, bool>> filter)
    {
        T entity = Query().FirstOrDefault(filter);
        if (entity != null)
            Remove(entity);
        return Task.FromResult(entity);
    }

    public Task<int> DeleteAllAsync(Expression<Func<T, bool>> filter)
    {
        T[] entities = [.. Query().Where(filter)];
        foreach (T entity in entities)
            Remove(entity);
        return Task.FromResult(entities.Length);
    }

    /// <param name="entity">the new or updated entity to be upserted</param>
    /// <param name="original">the original entity, if this is an update (or replacement)</param>
    /// <returns>
    /// true if there is any existing entity, other than the original, that shares any keys with the new or updated
    /// entity
    /// </returns>
    private bool CheckDuplicateKeys(T entity, T? original = default)
    {
        for (int i = 0; i < _uniqueKeySelectors.Length; i++)
        {
            object key = _uniqueKeySelectors[i](entity);
            if (
                key != null
                && _uniqueKeys[i].Contains(key)
                && (original == null || !key.Equals(_uniqueKeySelectors[i](original)))
            )
                return true;
        }
        return false;
    }

    private static T DeserializeEntity(string id, string json)
    {
        var entity = JsonConvert.DeserializeObject<T>(json, Settings);
        if (string.IsNullOrEmpty(entity.Id))
        {
            entity.Id = id;
        }

        return entity;
    }

    /// <summary>
    /// The class converts BSON to and from JSON to function like the MongoDB driver.
    /// </summary>
    private class BsonValueConverter : JsonConverter<BsonValue>
    {
        public override BsonValue ReadJson(
            JsonReader reader,
            Type objectType,
            BsonValue? existingValue,
            bool hasExistingValue,
            JsonSerializer serializer
        )
        {
            // Arrays are handled specially
            if (reader.TokenType == JsonToken.StartArray)
            {
                var bsonArray = new BsonArray();
                while (reader.Read() && reader.TokenType != JsonToken.EndArray)
                {
                    bsonArray.Add(BsonValue.Create(reader.Value));
                }

                return bsonArray;
            }

            // Handle objects
            if (reader.TokenType == JsonToken.StartObject)
            {
                var bsonDocument = new BsonDocument();

                while (reader.Read() && reader.TokenType != JsonToken.EndObject)
                {
                    if (reader.TokenType == JsonToken.PropertyName)
                    {
                        var propertyName = reader.Value?.ToString();
                        reader.Read();

                        // Recursively deserialize the value
                        var value = ReadJson(reader, typeof(BsonValue), null, false, serializer);
                        bsonDocument[propertyName!] = value;
                    }
                }

                return bsonDocument;
            }

            // Convert all other values
            return reader.Value is null ? BsonNull.Value : BsonValue.Create(reader.Value);
        }

        public override void WriteJson(JsonWriter writer, BsonValue value, JsonSerializer serializer)
        {
            if (value.IsBsonArray)
            {
                // Convert a BsonArray into a JSON array
                writer.WriteStartArray();
                foreach (var item in (BsonArray)value)
                {
                    serializer.Serialize(writer, item);
                }

                writer.WriteEndArray();
            }
            else if (value.IsBsonDocument)
            {
                // Convert a BSON document (i.e. an object) to a JSON object
                writer.WriteStartObject();
                foreach (var element in (BsonDocument)value)
                {
                    writer.WritePropertyName(element.Name);
                    serializer.Serialize(writer, element.Value);
                }
                writer.WriteEndObject();
            }
            else if (value.IsBsonNull)
            {
                // Handle nulls correctly
                writer.WriteNull();
            }
            else
            {
                // Write all other values using the defaults
                writer.WriteValue(value);
            }
        }
    }
}
