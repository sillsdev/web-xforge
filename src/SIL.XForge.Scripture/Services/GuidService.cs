using System;
using MongoDB.Bson;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// This class is injected to allow testing.
/// </summary>
public class GuidService : IGuidService
{
    public string Generate() => Guid.NewGuid().ToString();

    public string NewObjectId() => ObjectId.GenerateNewId().ToString();
}
