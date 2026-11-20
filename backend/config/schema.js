// DynamoDB table layouts. template.yaml creates the same tables on AWS;
// scripts/create-local-tables.js and the tests use this file for DynamoDB Local.
// If you change a key or index here, change template.yaml too.

const usersTable = (TableName) => ({
    TableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "role", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" }
    ],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
        {
            // "All students, newest first" for the admin page
            IndexName: "role-createdAt-index",
            KeySchema: [
                { AttributeName: "role", KeyType: "HASH" },
                { AttributeName: "createdAt", KeyType: "RANGE" }
            ],
            Projection: { ProjectionType: "ALL" }
        }
    ]
});

const jobsTable = (TableName) => ({
    TableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" }
    ],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
        {
            // "Open jobs, newest first" for Find Jobs
            IndexName: "status-createdAt-index",
            KeySchema: [
                { AttributeName: "status", KeyType: "HASH" },
                { AttributeName: "createdAt", KeyType: "RANGE" }
            ],
            Projection: { ProjectionType: "ALL" }
        }
    ]
});

module.exports = { usersTable, jobsTable };
