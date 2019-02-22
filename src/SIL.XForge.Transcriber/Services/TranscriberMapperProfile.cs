using AutoMapper;
using SIL.XForge.Transcriber.Models;

namespace SIL.XForge.Transcriber.Services
{
    public class TranscriberMapperProfile : Profile
    {
        public TranscriberMapperProfile()
        {
            CreateMap<TranscriberProjectUserEntity, TranscriberProjectUserResource>()
                .ReverseMap();
        }
    }
}
