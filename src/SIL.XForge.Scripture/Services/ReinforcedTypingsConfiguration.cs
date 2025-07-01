using Reinforced.Typings.Fluent;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services;

public class ReinforcedTypingsConfiguration
{
    public static void Configure(ConfigurationBuilder builder)
    {
        builder.Global(t => t.UseModules().CamelCaseForProperties());
        builder
            .ExportAsInterface<IOwnedData>()
            .WithPublicProperties()
            .AutoI(false)
            .OverrideName("OwnedData")
            .ExportTo("common/models/owned-data.ts");
    }
}
