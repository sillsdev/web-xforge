using Microsoft.Extensions.DependencyInjection;
using SIL.XForge.Scripture.Services;

namespace Microsoft.AspNetCore.Builder;

public static class SFApplicationBuilderExtensions
{
    public static void UseSFServices(this IApplicationBuilder app) =>
        app.ApplicationServices.GetService<IParatextService>().Init();
}
