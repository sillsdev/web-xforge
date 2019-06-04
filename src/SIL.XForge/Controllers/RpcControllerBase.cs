using EdjCase.JsonRpc.Core;
using EdjCase.JsonRpc.Router;
using EdjCase.JsonRpc.Router.Abstractions;
using Microsoft.AspNetCore.Authorization;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    /// <summary>
    /// This is the base class for all JSON-RPC controllers.
    /// </summary>
    [Authorize]
    public abstract class RpcControllerBase : RpcController
    {
        private readonly IHttpRequestAccessor _httpRequestAccessor;

        protected RpcControllerBase(IUserAccessor userAccessor, IHttpRequestAccessor httpRequestAccessor)
        {
            User = userAccessor;
            _httpRequestAccessor = httpRequestAccessor;
        }

        protected IUserAccessor User { get; }

        protected string ResourceId
        {
            get
            {
                string path = _httpRequestAccessor.Path.Value;
                // find beginning of the ID
                int index = path.IndexOf('/', $"/{XForgeConstants.JsonApiNamespace}".Length + 1);
                if (index < 0)
                    return null;
                index++;
                // get length of the ID
                int length = path.Length - $"/{XForgeConstants.CommandsEndpoint}".Length - index;
                if (length < 0)
                    return null;
                return path.Substring(index, length);
            }
        }

        protected IRpcMethodResult ForbiddenError()
        {
            return Error((int)RpcErrorCode.InvalidRequest,
                "The specified user does not have permission to perform this operation"
            );
        }

        protected IRpcMethodResult InvalidParamsError()
        {
            return Error((int)RpcErrorCode.InvalidParams);
        }
    }
}
