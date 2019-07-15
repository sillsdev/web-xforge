using System.Linq;
using SIL.XForge.Models;

namespace SIL.XForge.DataAccess
{
    public interface IReadOnlyRepository<T> where T : IEntity
    {
        void Init();

        IQueryable<T> Query();
    }
}
