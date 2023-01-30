#!/usr/bin/env python3

# Regularly record process information for SF service processes.
# Each run will record to a new log file.

import csv
import datetime
import os
import subprocess
import time

# Prepare output location

dataHomeDir = os.environ.get("XDG_DATA_HOME")
if dataHomeDir is None:
    homeDir = os.environ["HOME"]
    dataHomeDir = f"{homeDir}/.local/share"
logDir = f"{dataHomeDir}/sf-service-process-logs"
os.makedirs(logDir, exist_ok=True)
logCreationTime = datetime.datetime.now(datetime.timezone.utc).strftime("%FT%H-%M-%SZ")
outputFile = f"{logDir}/sf-{logCreationTime}.csv"

# What to record

fieldsToCaptureFromProc = [
    "Name",
    "Pid",
    "PPid",
    "State",
    "VmSize",
    "VmRSS",
    "VmSwap",
    "FDSize",
    "Threads",
]

fields = ["When"]
fields.extend(fieldsToCaptureFromProc)


def gatherUpdatedRecords():
    when = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

    dotnetPid = (
        subprocess.run(
            "pgrep SIL.XForge.Scri",
            shell=True,
            check=True,
            capture_output=True,
        )
        .stdout.decode("utf-8")
        .rstrip("\n")
    )

    nodePid = (
        subprocess.run(
            "pgrep --parent $(pgrep SIL.XForge.Scri) --full 'node -e'",
            shell=True,
            check=True,
            capture_output=True,
        )
        .stdout.decode("utf-8")
        .rstrip("\n")
    )

    records = []
    records.append(collectRecord(when, dotnetPid))
    records.append(collectRecord(when, nodePid))
    return records


def collectRecord(when, pid):
    with open(f"/proc/{pid}/status", "r") as statusFile:
        statusArray = statusFile.readlines()
        newRecord = {}
        newRecord["When"] = when
        for statum in statusArray:
            [desc, value] = statum.split(sep=":\t")
            value = value.rstrip("\n")
            if desc in ["VmSize", "VmRSS", "VmSwap"]:
                # Convert human-readable display to bytes
                value = int(value.strip().split(" ")[0]) * 1024
            if desc in fieldsToCaptureFromProc:
                newRecord[desc] = value
        return newRecord


def main():
    lineBufferingIndicator = 1
    with open(outputFile, "w", buffering=lineBufferingIndicator) as csvOutputFile:
        writer = csv.DictWriter(csvOutputFile, fieldnames=fields)
        writer.writeheader()

        while True:
            records = gatherUpdatedRecords()
            for record in records:
                writer.writerow(record)
            time.sleep(10)


main()
