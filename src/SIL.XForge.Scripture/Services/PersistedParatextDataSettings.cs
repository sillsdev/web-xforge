using Paratext.Data;
using PtxUtils;

namespace SIL.XForge.Scripture;

class PersistedParatextDataSettings : IParatextDataSettings
{
    public SerializableStringDictionary LastRegistryDataCachedTimes { get; set; }

    public void SafeSave() { }
}
