using System;
namespace SIL.XForge.Services
{
    public class DataNotFoundException : Exception
    {
        public DataNotFoundException(string message)
            : base(message)
        {
        }
    }
}
