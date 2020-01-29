using System.Security.Claims;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router;
using EdjCase.JsonRpc.Router.Abstractions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace SIL.XForge.Services
{
    public class MultiAuthSchemeRpcHttpRouter : IRouter
    {
        private readonly RpcHttpRouter _internalRouter;

        public MultiAuthSchemeRpcHttpRouter(IRpcRouteProvider routeProvider)
        {
            _internalRouter = new RpcHttpRouter(routeProvider);
        }

        public VirtualPathData GetVirtualPath(VirtualPathContext context)
        {
            return _internalRouter.GetVirtualPath(context);
        }

        public async Task RouteAsync(RouteContext context)
        {
            if (context.HttpContext.Request.ContentType != "application/json") return;

            var authSchemeProvider = context.HttpContext.RequestServices.GetService<IAuthenticationSchemeProvider>();
            ClaimsPrincipal principal = null;
            foreach (AuthenticationScheme scheme in await authSchemeProvider.GetAllSchemesAsync())
            {
                AuthenticateResult result = await context.HttpContext.AuthenticateAsync(scheme.Name);
                if (result.Succeeded)
                {
                    if (principal == null)
                        principal = result.Principal;
                    else
                        principal.AddIdentities(result.Principal.Identities);
                }
            }
            if (principal != null) context.HttpContext.User = principal;
            await _internalRouter.RouteAsync(context);
        }
    }
}
