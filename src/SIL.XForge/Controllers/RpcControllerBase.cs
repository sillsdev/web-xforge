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
        private readonly Bugsnag.IClient _bugsnag;
        private readonly IUserAccessor _userAccessor;

        protected RpcControllerBase(IUserAccessor userAccessor, Bugsnag.IClient client)
        {
            _userAccessor = userAccessor;
            _bugsnag = client;

            // Report the user id to bugsnag for this request
            if (!string.IsNullOrWhiteSpace(_userAccessor.UserId))
            {
                _bugsnag.BeforeNotify(report =>
                {
                    report.Event.User = new Bugsnag.Payload.User
                    {
                        Id = _userAccessor.UserId,
                    };
                });
            }
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
