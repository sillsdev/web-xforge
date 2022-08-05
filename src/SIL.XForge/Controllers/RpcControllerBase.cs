using EdjCase.JsonRpc.Common;
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
        private readonly IExceptionHandler _exceptionHandler;
        private readonly IUserAccessor _userAccessor;

        protected RpcControllerBase(IUserAccessor userAccessor, IExceptionHandler exceptionHandler)
        {
            _userAccessor = userAccessor;
            _exceptionHandler = exceptionHandler;

            // Report the user id to bugsnag for this request
            exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
        }

        protected string UserId => _userAccessor.UserId;
        protected string SystemRole => _userAccessor.SystemRole;
        protected string AuthId => _userAccessor.AuthId;

        protected IRpcMethodResult InvalidParamsError(string message)
        {
            return Error((int)RpcErrorCode.InvalidParams, message);
        }

        protected IRpcMethodResult ForbiddenError()
        {
            return Error(-32000, "The user does not have permission to perform this operation.");
        }

        protected IRpcMethodResult NotFoundError(string message)
        {
            return Error(-32001, message);
        }
    }
}
