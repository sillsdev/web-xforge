using System;

namespace SIL.XForge.Scripture.Models;

/// <summary>
/// The configuration used for Quality Estimation.
/// </summary>
public record QualityEstimationConfig
{
    public required string Version { get; set; }
    public double Slope { get; set; }
    public double Intercept { get; set; }
    public DateTime DateUpdated { get; set; }
}
