# USFM Roundtrip Tool

This tool will round trip the USFM files in a directory, including inside subdirectories, zip files and DBL resources.

## Running

To run on the Scripture Forge directory:

```sh
dotnet run /var/lib/scriptureforge/sync/
```

Or to run on your Paratext directory on Windows:

```sh
dotnet run "C:\My Paratext 9 Projects"
```

To export the output for all files that fail to roundtrip:

```sh
dotnet run /var/lib/scriptureforge/sync/ --output-sfm
```

Or, to export all of the files that the tool roundtrips:

```sh
dotnet run /var/lib/scriptureforge/sync/ --output-all
```

## Notes

- Unlike **ServalDownloader**, this tool does not utilize the user secrets you have configured for Scripture Forge.
- To view a time series graph of the builds, select all of the data on the Summary sheet, and create a 2-D Line Graph.
