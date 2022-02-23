# time-tracking

> scripts for processing data from Screenshot Monitor and Jira Cloud

## Prerequisties

This command-line utiltiy requires Node.js version 14 or higher. Download the latest version of Node.js from
https://nodejs.org/en/download/current/.

The currently installed version of Node.js will be checked while installing the utility, and on every invocation of the command.

## Installation Instructions

To install the script:

- open up a command prompt to the project directory
  - you may need to extract an archive of the project first
- run `npm install` in the project directory to download all dependencies
- run `npm link` to install the command globally

During this installation process, the TypeScript compiler will compile the project's TypeScript source files into runnable JavaScript.

After the install completes, you can run the `time-tracking` command from any directory.

## Usage Instructions

The `time-tracking` command comes with the following subcommands:

- `sync`    - will gather records from Screenshot Monitor and use those records to update Jira Cloud with appropriate work logs
- `daily`   - Get invalid activities from Screenshot Monitor at current date: validating activities on Screenshot Monitor by note pattern and issue from Jira Cloud
- `weekly`  - is the initially implemented report: aggregated time-tracking statistics per issue from Jira Cloud
- `monthly` - is the additional report: grouped time-tracking data for Screenshot Monitor records
- `epics`   - a new report that collects issue counts for epics in Jira Cloud
- `mails`   -Get mails from office365 outlook
-  `support-email-jira-rec`   -Group tickets and send notifications
-  `support-admin`   -Add offline activities
-  `set-project`   -Set project to activities missing project using description

### Project Filtering

All subcommands allow you to filter processing by project using the `-p` flag.

### SSM Time Period

All subcommands allow you to pass SSM time period using the `-t` flag.

As values, 'all-time', 'today', 'yesterday', 'this-week', 'this-month', 'last-week', 'last-month', 'this-year', 'last-year'

### Output Directory

By default, all reports and operation logs are saved to disk in an `output` directory under the current working directory (the folder where you invoke the command from).

### Time Command for support-admin

-st can be used to specify the amount of time added on by the support-admin command

### Days command for sync, set-project

- --days can be used to specify the amount of days the sync command and set-project command  goes back.
- -t option can be also used without --days option.

### Help

For detailed information about each subcommand and applicable command-line flags for each one, use the `--help` flag:

```sh
# get help for the command in general
time-tracking --help
```

```sh
# get help for the sync subcommand
time-tracking --help sync
# alternative syntax
time-tracking sync --help
```

### Configuration

In addition to command-line arguments, config files are included for each command for commonly-used values.
These values can be updated in the `configs` directory, and they should be automatically picked up on the next command invocation.
If your config changes don't appear to be picked up, run `npm link` to recompile the TypeScript project.

### Examples

Here are some example invocations:

```sh
# sync records from Screenshot Monitor to Jira Cloud for all projects
time-tracking sync
```

```sh
# only sync records for the AMM project
time-tracking sync -p AMM
```

```sh
# only sync records for the BS and DF projects
time-tracking sync -p BS -p DF
# or
time-tracking sync -p BS DF
```

```sh
# send invalid activities for each project to Integromat using webhook url on config.
# try sending for all projects.
time-tracking daily
```

```sh
# send invalid activities for each project to Integromat using webhook url on config.
# try sending for DDH, RSC projects.
time-tracking daily -p DDH RSC
```

```sh
# generate weekly reports for all applicable projects (currently AMM, DDH, FD, PS, RSC)
time-tracking weekly
```

```sh
# generate weekly reports only for the PS project
time-tracking weekly -p PS
```

```sh
# generate weekly reports only for the DDH and RSC projects
time-tracking weekly -p DDH -p RSC
# or
time-tracking weekly -p DDH RSC
```

```sh
# generate monthly reports for all projects
time-tracking monthly
```

```sh
# generate monthly reports only for the AMM and PS projects
time-tracking monthly -p AMM -p PS
# or
time-tracking monthly -p AMM PS
```

```sh
#generate monthly report only for BF project with SSM time period
time-tracking monthly -p BF -t this-month
```

```sh
#add offline activity(18minutes) per issue of FD and AMM projects that were tracked by SSM last month.
#You need to set surly "teamMembers" as  members for SSM activities in config file.
#If you want to set note(exclude issue key) for offline activities, set "description" in config file.  
time-tracking support-admin -p FD AMM -t last-month -st 18
```
```sh
#For the last 15 days,remove mismatch worklogs of FD issues in JIRA and add new worklogs of FD issues from SSM to JIRA.
#timezone for time range is localtimezone and basetime depend on 'now' from SSM.
time-tracking sync --days 15 -p FD
```
```sh
#It can also use time option without days option to set time range.
#timezone for time range is localtimezone and basetime depend on 'now' from SSM.
time-tracking sync -t last-month -p FD
```
```sh
#For the last 25 days,set project to SSM activities for FD issues missing project. 
#This command check whether FD project and FD issues exist on JIRA before set project.
#timezone for time range is localtimezone and basetime depend on 'now' from SSM.
time-tracking set-project --days 25 -p FD
```
```sh
#It can also use time option without days option to set time range.
#timezone for time range is localtimezone and basetime depend on 'now' from SSM.
time-tracking set-project -t this-month -p FD
```