using System;
using System.Collections.Generic;
using System.CommandLine;
using System.CommandLine.Builder;
using System.CommandLine.Invocation;
using System.CommandLine.IO;
using System.CommandLine.Parsing;

namespace Zippy;

/// <summary>
/// Contains the System.CommandLine wiring for Zippy.
/// This is separate from <see cref="ZipService"/> so it can be unit tested.
///
/// The purpose of the Zippy program is to provide a helper to test the functionality of SharpZipLib.
/// </summary>
public static class Cli
{
    public static Parser BuildParser()
    {
        var rootCommand = new RootCommand("Zippy: zip and unzip utility") { TreatUnmatchedTokensAsErrors = true };

        var unzipCommand = new Command("unzip", "Extract a zip file into the current working directory");
        var unzipZipPathArgument = new Argument<string>("zipFile", description: "The zip file to extract")
        {
            Arity = ArgumentArity.ExactlyOne,
        };
        unzipCommand.AddArgument(unzipZipPathArgument);

        unzipCommand.SetHandler(
            (string zipFilePath) =>
            {
                var zipService = new ZipService();
                zipService.ExtractZipToCurrentDirectory(zipFilePath);
            },
            unzipZipPathArgument
        );

        var zipCommand = new Command("zip", "Create a zip file from files and directories");
        var zipZipPathArgument = new Argument<string>("zipFile", description: "The zip file to create")
        {
            Arity = ArgumentArity.ExactlyOne,
        };
        var zipInputsArgument = new Argument<List<string>>(
            "inputs",
            description: "Files and directories to include in the zip (added as root items)"
        )
        {
            Arity = ArgumentArity.OneOrMore,
        };
        zipCommand.AddArgument(zipZipPathArgument);
        zipCommand.AddArgument(zipInputsArgument);

        zipCommand.SetHandler(
            (string zipFilePath, List<string> inputs) =>
            {
                var zipService = new ZipService();
                zipService.CreateZip(zipFilePath, inputs);
            },
            zipZipPathArgument,
            zipInputsArgument
        );

        rootCommand.AddCommand(unzipCommand);
        rootCommand.AddCommand(zipCommand);

        // System.CommandLine's default exception handler prints a stack trace.
        // Override it so we only print a concise message and return exit code 1.
        return new CommandLineBuilder(rootCommand)
            .UseDefaults()
            .UseExceptionHandler(
                (Exception ex, InvocationContext context) =>
                {
                    context.Console.Error.WriteLine(ex.Message);
                    context.ExitCode = 1;
                },
                1
            )
            .Build();
    }

    public static Task<int> RunAsync(string[] args, IConsole console)
    {
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(console);

        Parser parser = BuildParser();
        return parser.InvokeAsync(args, console);
    }
}
