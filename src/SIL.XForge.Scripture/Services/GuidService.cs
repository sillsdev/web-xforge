using System;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class is injected to allow testing.
    /// </summary>
    public class GuidService : IGuidService
    {
        public string Generate()
        {
            return Guid.NewGuid().ToString();
        }
    }
}
