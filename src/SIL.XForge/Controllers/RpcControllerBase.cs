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
        private readonly IUserAccessor _userAccessor;

        protected RpcControllerBase(IUserAccessor userAccessor)
        {
            _userAccessor = userAccessor;
        }

        protected string UserId => _userAccessor.UserId;
        protected string SystemRole => _userAccessor.SystemRole;
        protected string AuthId => _userAccessor.AuthId;

        protected IRpcMethodResult ForbiddenError()
        {
            return Error((int)RpcErrorCode.InvalidRequest,
                "The user does not have permission to perform this operation."
            );
        }

        protected IRpcMethodResult InvalidParamsError()
        {
            return Error((int)RpcErrorCode.InvalidParams);
        }
    }
}
