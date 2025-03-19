using MongoDB.Bson;
using SIL.XForge.Scripture.Services;

namespace Roundtrip;

public class SequentialGuidService : IGuidService
{
    private int _seed;

    public string Generate() => $"{++_seed:X16}-{Guid.Empty.ToString()[9..]}";

    public string NewObjectId() => ObjectId.GenerateNewId(_seed).ToString();
}
