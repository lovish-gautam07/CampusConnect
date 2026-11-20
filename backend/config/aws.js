const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");

// On Lambda, AWS_REGION and the credentials come from the function's role.
// Locally, they come from backend/.env (see .env.example).
const region = process.env.AWS_REGION || "us-east-1";

// DYNAMODB_ENDPOINT points at DynamoDB Local during development and tests.
const dynamoClient = new DynamoDBClient({
    region,
    ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT })
});

const db = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: { removeUndefinedValues: true }
});

// S3_ENDPOINT is only for an S3-compatible emulator during development.
const s3 = new S3Client({
    region,
    ...(process.env.S3_ENDPOINT && {
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: true
    })
});

const tables = {
    users: process.env.USERS_TABLE || "campusconnect-users",
    jobs: process.env.JOBS_TABLE || "campusconnect-jobs"
};

const resumeBucket = () => process.env.RESUME_BUCKET;

module.exports = { db, dynamoClient, s3, tables, resumeBucket };
