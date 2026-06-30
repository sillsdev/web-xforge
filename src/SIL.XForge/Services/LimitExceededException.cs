using System;

namespace SIL.XForge.Services;

public class LimitExceededException(string message) : Exception(message);
