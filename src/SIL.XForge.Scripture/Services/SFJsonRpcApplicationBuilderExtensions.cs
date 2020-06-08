using SIL.XForge;
using SIL.XForge.Scripture.Controllers;

namespace Microsoft.AspNetCore.Builder
{
    public static class SFJsonRpcApplicationBuilderExtensions
    {
        public static void UseSFJsonRpc(this IApplicationBuilder app)
        {
            app.UseXFJsonRpc(options =>
            {
                options.AddControllerWithCustomPath<SFProjectsRpcController>(UrlConstants.Projects);
            });
        }
    }
}
