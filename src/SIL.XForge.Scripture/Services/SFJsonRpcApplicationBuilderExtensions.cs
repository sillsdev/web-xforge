using SIL.XForge.Models;
using SIL.XForge.Scripture.Controllers;

namespace Microsoft.AspNetCore.Builder
{
    public static class SFJsonRpcApplicationBuilderExtensions
    {
        public static void UseSFJsonRpc(this IApplicationBuilder app)
        {
            app.UseXFJsonRpc(options =>
            {
                options.RegisterController<SFProjectsRpcController>(RootDataTypes.Projects);
            });
        }
    }
}
