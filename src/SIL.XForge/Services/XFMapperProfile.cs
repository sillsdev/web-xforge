using AutoMapper;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public class XFMapperProfile : Profile
    {
        public XFMapperProfile(string site)
        {
            CreateMap<ProjectUserEntity, ProjectUserResource>()
                .IncludeAllDerived()
                .ReverseMap();
        }
    }
}
