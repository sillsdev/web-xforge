using Newtonsoft.Json;
using SIL.XForge.Models;

namespace SIL.XForge.Services;

[JsonConverter(typeof(InterfaceJsonConverter<IUserAccessor, UserAccessorDto>))]
public interface IUserAccessor
{
    bool IsAuthenticated { get; }
    string UserId { get; }
    string[] SystemRoles { get; }
    string Name { get; }
    string AuthId { get; }
}
