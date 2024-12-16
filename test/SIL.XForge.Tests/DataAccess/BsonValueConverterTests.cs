using System;
using System.IO;
using System.Text;
using System.Text.Json;
using IdentityModel;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using NUnit.Framework;
using SIL.XForge.Models;

namespace SIL.XForge.DataAccess;

[TestFixture]
public class BsonValueConverterTests
{
    [Test]
    public void ReadWrite_Array()
    {
        var env = new TestEnvironment();
        string[] value = ["Test", "Value"];
        BsonArray bsonValue = BsonArray.Create(value);
        const string expected = "[\"Test\",\"Value\"]";

        // SUT 1
        string actual = env.Write(bsonValue);
        Assert.AreEqual(expected, actual);

        // SUT 2
        BsonValue readValue = env.Read(actual);
        Assert.AreEqual(bsonValue, readValue);
    }

    [Test]
    public void ReadWrite_DateTime()
    {
        // DateTimes are a struct, so cannot be used in a Write_Success() TestCase
        var env = new TestEnvironment();

        // BsonDateTime stores internally as the unix epoch, and so for the test we will just round to the epoch
        DateTime value = DateTime.UnixEpoch.AddMilliseconds(DateTime.UtcNow.ToEpochTime());
        BsonDateTime bsonValue = BsonDateTime.Create(value);
        string expected = $"\"{value:o}\"";

        // SUT 1
        string actual = env.Write(bsonValue);
        Assert.AreEqual(expected, actual);

        // SUT 2
        BsonValue readValue = env.Read(actual);
        Assert.AreEqual(bsonValue, readValue);
    }

    [Test]
    public void ReadWrite_Decimal()
    {
        // Decimals are a struct, so cannot be used in a Write_Success() TestCase
        var env = new TestEnvironment();
        const decimal value = 123.456M;
        BsonDecimal128 bsonValue = BsonDecimal128.Create(value);
        const string expected = "123.456";

        // We read float and decimal as double from Json to Bson
        BsonDouble expectedValue = BsonDouble.Create(123.456);

        // SUT 1
        string actual = env.Write(bsonValue);
        Assert.AreEqual(expected, actual);

        // SUT 2
        BsonValue readValue = env.Read(actual);
        Assert.AreEqual(expectedValue, readValue);
    }

    [Test]
    public void Read_IncompleteArray()
    {
        var env = new TestEnvironment(allowComments: false, allowIncompleteJson: true);
        const string token = "[";
        var expectedValue = new BsonArray();

        // SUT
        BsonValue readValue = env.Read(token);
        Assert.AreEqual(expectedValue, readValue);
    }

    [Test]
    public void Read_IncompleteObject()
    {
        var env = new TestEnvironment(allowComments: false, allowIncompleteJson: true);
        const string token = "{";
        var expectedValue = new BsonDocument();

        // SUT
        BsonValue readValue = env.Read(token);
        Assert.AreEqual(expectedValue, readValue);
    }

    [Test]
    public void ReadWrite_Object()
    {
        var env = new TestEnvironment();
        var value = new TestSimpleObject { ProjectId = "Project01", UserId = "User01" };
        BsonDocument bsonValue = new BsonDocument
        {
            { nameof(value.ProjectId), value.ProjectId },
            { nameof(value.UserId), value.UserId },
        };

        string expected =
            $"{{\"{nameof(value.ProjectId)}\":\"{value.ProjectId}\",\"{nameof(value.UserId)}\":\"{value.UserId}\"}}";

        // SUT 1
        string actual = env.Write(bsonValue);
        Assert.AreEqual(expected, actual);

        // SUT 2
        BsonValue readValue = env.Read(actual);
        Assert.AreEqual(bsonValue, readValue);
    }

    [TestCase("Test Value", "\"Test Value\"")]
    [TestCase(int.MaxValue, "2147483647")]
    [TestCase(long.MaxValue, "9223372036854775807")]
    [TestCase(123.456, "123.456")]
    [TestCase(true, "true")]
    [TestCase(false, "false")]
    [TestCase(null, "null")]
    public void ReadWrite_Success(object value, string expected)
    {
        var env = new TestEnvironment();
        BsonValue bsonValue = BsonValue.Create(value);

        // SUT 1
        string actual = env.Write(bsonValue);
        Assert.AreEqual(expected, actual);

        // SUT 2
        BsonValue readValue = env.Read(actual);
        Assert.AreEqual(bsonValue, readValue);
    }

    [Test]
    public void Read_Unsupported()
    {
        var env = new TestEnvironment(allowComments: true);
        const string token = "/* Comments are not supported */";

        // SUT
        Assert.Throws<JsonException>(() => env.Read(token));
    }

    [Test]
    public void Write_Unsupported()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.Throws<JsonException>(() => env.Write(BsonObjectId.Empty));
    }

    private class TestEnvironment(bool allowComments = false, bool allowIncompleteJson = false)
    {
        private BsonValueConverter Converter { get; } = new BsonValueConverter();

        public BsonValue? Read(string token)
        {
            byte[] jsonData = Encoding.UTF8.GetBytes(token);
            var reader = allowIncompleteJson
                ? new Utf8JsonReader(jsonData, isFinalBlock: false, new JsonReaderState())
                : new Utf8JsonReader(
                    jsonData,
                    allowComments ? new JsonReaderOptions { CommentHandling = JsonCommentHandling.Allow } : default
                );
            reader.Read();
            return Converter.Read(
                ref reader,
                typeof(BsonValue),
                JsonRpcServiceCollectionExtensions.JsonSerializerOptions
            );
        }

        public string Write(BsonValue value)
        {
            using var ms = new MemoryStream();
            using var writer = new Utf8JsonWriter(ms);
            Converter.Write(writer, value, JsonRpcServiceCollectionExtensions.JsonSerializerOptions);
            writer.Flush();
            return Encoding.UTF8.GetString(ms.ToArray());
        }
    }
}
