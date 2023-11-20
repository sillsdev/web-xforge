using System;
using Newtonsoft.Json;
using NSubstitute;
using NUnit.Framework;

namespace SIL.XForge.Realtime;

[TestFixture]
public class IntegerToUtcDateTimeConverterTests
{
    [Test]
    public void CanConvert_Success()
    {
        var converter = new IntegerToUtcDateTimeConverter();

        // SUT
        bool actual = converter.CanConvert(typeof(DateTime));

        Assert.IsTrue(actual);
    }

    [Test]
    public void CanConvert_UnsupportedType()
    {
        // Arrange
        var converter = new IntegerToUtcDateTimeConverter();

        // SUT
        bool actual = converter.CanConvert(typeof(string));

        Assert.IsFalse(actual);
    }

    [Test]
    public void ReadJson_Success()
    {
        var converter = new IntegerToUtcDateTimeConverter();
        var reader = Substitute.For<JsonReader>();
        reader.Value.Returns("1637472000000");
        var serializer = Substitute.For<JsonSerializer>();

        // SUT
        DateTime actual = (DateTime)converter.ReadJson(reader, typeof(DateTime), existingValue: null, serializer);

        DateTime expected = new DateTime(2021, 11, 21, 5, 20, 0, DateTimeKind.Utc);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void ReadJson_InvalidValue()
    {
        var converter = new IntegerToUtcDateTimeConverter();
        var reader = Substitute.For<JsonReader>();
        reader.Value.Returns("invalid_value");
        var serializer = Substitute.For<JsonSerializer>();

        // SUT
        var actual = converter.ReadJson(reader, typeof(DateTime), existingValue: null, serializer);

        // Assert
        DateTime expected = DateTime.MinValue;
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void ReadJson_NullValue()
    {
        var converter = new IntegerToUtcDateTimeConverter();
        var reader = Substitute.For<JsonReader>();
        reader.Value.Returns(null);
        var serializer = Substitute.For<JsonSerializer>();

        // SUT
        var actual = converter.ReadJson(reader, typeof(DateTime), existingValue: null, serializer);

        // Assert
        DateTime expected = DateTime.MinValue;
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void WriteJson_NotImplemented()
    {
        var converter = new IntegerToUtcDateTimeConverter();
        var writer = Substitute.For<JsonWriter>();
        var serializer = Substitute.For<JsonSerializer>();

        // SUT
        Assert.Throws<NotImplementedException>(() => converter.WriteJson(writer, DateTime.UtcNow, serializer));
    }
}
