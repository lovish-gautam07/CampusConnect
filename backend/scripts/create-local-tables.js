// Creates the users and jobs tables in DynamoDB Local.
// On AWS, template.yaml creates them instead.
//
//   npm run db:local   (in one terminal: starts DynamoDB Local in Docker)
//   npm run db:setup   (in another: creates the tables)

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
    CreateTableCommand,
    DeleteTableCommand,
    DescribeTableCommand,
    waitUntilTableExists
} = require("@aws-sdk/client-dynamodb");

const { dynamoClient, tables } = require("../config/aws");
const { usersTable, jobsTable } = require("../config/schema");

const tableExists = async (TableName) => {
    try {
        await dynamoClient.send(new DescribeTableCommand({ TableName }));
        return true;
    } catch (error) {
        if (error.name === "ResourceNotFoundException") return false;
        throw error;
    }
};

const createTables = async ({ quiet = false } = {}) => {
    for (const definition of [usersTable(tables.users), jobsTable(tables.jobs)]) {
        if (await tableExists(definition.TableName)) {
            if (!quiet) console.log(`Table ${definition.TableName} already exists.`);
            continue;
        }

        await dynamoClient.send(new CreateTableCommand(definition));
        await waitUntilTableExists(
            { client: dynamoClient, maxWaitTime: 30 },
            { TableName: definition.TableName }
        );

        if (!quiet) console.log(`Created table ${definition.TableName}.`);
    }
};

const deleteTables = async () => {
    for (const TableName of [tables.users, tables.jobs]) {
        if (await tableExists(TableName)) {
            await dynamoClient.send(new DeleteTableCommand({ TableName }));
        }
    }
};

if (require.main === module) {
    if (!process.env.DYNAMODB_ENDPOINT) {
        console.error(
            "DYNAMODB_ENDPOINT is not set. This script is only for DynamoDB Local;\n" +
            "on AWS, `sam deploy` creates the tables from template.yaml."
        );
        process.exit(1);
    }

    createTables().catch((error) => {
        console.error("Could not create tables:", error.message);
        console.error("Is DynamoDB Local running? Start it with: npm run db:local");
        process.exit(1);
    });
}

module.exports = { createTables, deleteTables };
