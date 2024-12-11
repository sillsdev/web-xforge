using System;

namespace SIL.XForge.Models;

public class TestComplexObject : TestSimpleObject
{
    // ReSharper disable UnusedAutoPropertyAccessor.Global
    public required bool Boolean { get; init; }
    public required DateTime DateAndTime { get; init; }
    public required decimal DecimalNumber { get; init; }
    public required double DoubleFloat { get; init; }
    public required int Integer { get; init; }
    public required long LongInteger { get; init; }
    public required float SingleFloat { get; init; }
    // ReSharper restore UnusedAutoPropertyAccessor.Global
}
