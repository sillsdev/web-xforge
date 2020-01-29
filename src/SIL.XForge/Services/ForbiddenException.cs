using System;

namespace SIL.XForge.Services
{
    public class ForbiddenException : Exception
    {
        public ForbiddenException() :
            base("The user does not have permission to perform this operation.")
        {
        }
    }
}
