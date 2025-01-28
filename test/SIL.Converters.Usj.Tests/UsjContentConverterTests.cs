using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace SIL.Converters.Usj.Tests;

[TestFixture]
public class UsjContentConverterTests
{
    [Test]
    public void ShouldReadAndWriteJson()
    {
        Usj? usj = JsonConvert.DeserializeObject<Usj>(TestData.JsonGen1V1, new UsjContentConverter());
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
        string json = JsonConvert.SerializeObject(usj, new UsjContentConverter());

        // The properties will be out of order, so we need to parse the JSON and compare the JTokens.
        JToken actual = JToken.Parse(json);
        JToken expected = JToken.Parse(TestData.JsonGen1V1);
        Assert.That(JToken.DeepEquals(actual, expected), Is.True);
    }
}
