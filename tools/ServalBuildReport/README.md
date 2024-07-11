# Serval Build Report

This tool generates a report on the success/failure rates over time, and outputs a spreadsheet.

## Running

To generate the report for Serval Production (used by Scripture Forge Production and QA) run:

```sh
dotnet run prod
```

Or to report on QA (used by Scripture Forge developer machines):

```sh
dotnet run qa
```

## Configuration

Before running for the first time, please configure the Serval secrets for Production and QA.

For example:

```sh
dotnet user-secrets set "QA:ClientId" "qa_client_id_goes_here"
dotnet user-secrets set "QA:ClientSecret" "qa_client_secret_goes_here"
dotnet user-secrets set "Prod:ClientId" "prod_client_id_goes_here"
dotnet user-secrets set "Prod:ClientSecret" "prod_client_secret_goes_here"
```

## Adding a new environment

If you want to add a new Serval environment, you can do this via the user secrets. For example, to add Test:

```sh
dotnet user-secrets set "Test:ApiServer" "api_server_goes_here"
dotnet user-secrets set "Test:Audience" "audience_goes_here"
dotnet user-secrets set "Test:ClientId" "client_id_goes_here"
dotnet user-secrets set "Test:ClientSecret" "client_secret_goes_here"
dotnet user-secrets set "Test:TokenUrl" "token_url_goes_here"
```

Then run the report:

```sh
dotnet run test
```

## Notes

- Unlike **ServalDownloader**, this tool does not utilize the user secrets you have configured for Scripture Forge.
- To view a time series graph of the builds, select all of the data on the Summary sheet, and create a 2-D Line Graph.
